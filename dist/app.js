'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var _ = _interopDefault(require('lodash'));
var jsYaml = require('js-yaml');
var cheerio = _interopDefault(require('cheerio'));
var req = _interopDefault(require('request-promise-native'));
var redis = _interopDefault(require('then-redis'));
var fs = _interopDefault(require('fs'));
var mailcomposer = _interopDefault(require('mailcomposer'));
var Mailgun = _interopDefault(require('mailgun-js'));
var nunjucks = _interopDefault(require('nunjucks'));

nunjucks.configure('.', { autoescape: true });
let mailgun = Mailgun({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: process.env.MAILGUN_DOMAIN
});

//REQ
let reqOptions = {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    'Cache-Control': 'no-cache'
  }
};

//MONEY


// EMAIL
function makeEmail(groups) {
  return nunjucks.render('template.tmpl', { groups: groups });
}

function sendEmail(email, toEmail, exit) {
  let mail = mailcomposer({
    from:
      'Yapo Alerts <alerts@sandboxdebf46a0d2c34fe390501cdd02ee004d.mailgun.org>',
    to: toEmail,
    subject: 'Hay nuevas publicaciones en tus busquedas!',
    body: 'Abrelo...',
    html: email,
    encoding: 'utf-8'
  });
  if (process.env.FAKE) {
    fs.writeFileSync('email.html', email, { encoding: 'utf-8' });
    if (exit) process.exit(0);
  }
  mail.build(function(mailBuildError, message) {
    let dataToSend = {
      to: toEmail,
      message: message.toString('ascii')
    };
    mailgun.messages().sendMime(dataToSend, (sendError, body) => {
      if (sendError) {
        console.error(sendError);
        if (exit) process.exit(1);
      } else {
        console.log('Email sent!');
        if (exit) process.exit(0);
      }
    });
  });
}

let cache = redis.createClient(process.env.REDIS_URL);
if (process.env.REDIS_FLUSH) cache.flushdb();

let reqs = [];
let toEmail;

req(process.env.SOURCE_PATH)
  .then(content => {
    let parsed = jsYaml.safeLoad(content);
    toEmail = parsed.email;
    return parsed.busquedas;
  })
  .then(busquedas => {
    busquedas.forEach((b, i) => {
      let name = b.nombre;
      let r = req(b.url, reqOptions)
        .then(body => {
          return cheerio.load(body);
        })
        .then($ => {
          return $;
        })
        .then($ => {
          let $ads = $('.search-listings__items .listing-item'),
            ads = [];
          $ads.each((i, el) => {
            const $el = $(el);

            let imgurl = $el.find('.carousel-inner .item.active').attr('style');
            if (imgurl) {
              imgurl = imgurl.match(/url\((.+)\)/)[1];
              imgurl = imgurl.replace(/\\0000/g, '%');
              imgurl = decodeURIComponent(imgurl);
            }
            $el
              .find('.listing-item__carousel')
              .html(`<img src="${imgurl}" width="300"/>`);

            const url = $el.find('.listing-item__header a').attr('href');

            let ad = {
              id: url.split('/').pop(),
              url: url,
              html: $el.html(),
              title: $el.find('.listing-item__title').text(),
              price: $el.find('.listing-item__price p').text(),
              imgurl: imgurl
            };
            ads.push(ad);
          });
          // return [];
          return ads;
        })
        .then(ads => {
          if (ads.length == 0) return { items: [] };
          return cache.mget(ads.map(a => a.id)).then(function(caches) {
            let group = {};
            group.title = name;
            group.items = [];
            ads.forEach((ad, i) => {
              if (caches[i]) {
                let cached = JSON.parse(caches[i]);
              } else {
                group.items.push(ad.html);
                cache.set(ad.id, JSON.stringify(ad));
              }
            });
            return group;
          });
        })
        .then(group => {
          if (group.items.length < 1) {
            console.log('nada nuevo para ', name);
            return null;
          } else {
            console.log('%s nuevos para %s', group.items.length, name);
            return group;
          }
        })
        .catch(e => {
          console.log(e);
        });
      reqs.push(r);
    });

    Promise.all(reqs).then(groups => {
      groups = _.compact(groups);
      if (groups.length > 0) {
        console.log(`enviando notificaciones a ${toEmail}`);
        const email = makeEmail(groups);
        sendEmail(email, toEmail, true);
      } else {
        console.log('nada que reportar');
        process.exit(0);
      }
    });
  });
