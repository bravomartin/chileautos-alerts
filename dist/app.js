'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var _ = _interopDefault(require('lodash'));
var jsYaml = require('js-yaml');
var cheerio = _interopDefault(require('cheerio'));
var req = _interopDefault(require('request-promise-native'));
var redis = _interopDefault(require('then-redis'));
var mailcomposer = _interopDefault(require('mailcomposer'));
var Mailgun = _interopDefault(require('mailgun-js'));
var nunjucks = _interopDefault(require('nunjucks'));

nunjucks.configure('.', { autoescape: true });
let mailgun = Mailgun({apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN});

//REQ
let reqOptions = { headers: {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'}};

//MONEY


// EMAIL
function makeEmail(groups){
  return nunjucks.render('template.tmpl', {groups: groups})
}

function sendEmail(email, toEmail, exit){
  let mail = mailcomposer({
    from: 'Yapo Alerts <alerts@sandboxdebf46a0d2c34fe390501cdd02ee004d.mailgun.org>',
    to: toEmail,
    subject: "Hay nuevas publicaciones en tus busquedas!",
    body: 'Abrelo...',
    html: email,
    encoding: 'utf-8'
  });

  mail.build( function(mailBuildError, message){
    let dataToSend = {
      to: toEmail,
      message: message.toString('ascii')
    };
    mailgun.messages().sendMime( dataToSend, (sendError, body)=>{
      if (sendError){
        console.error(sendError);
        if(exit) process.exit(1);
      } else {
        console.log("Email sent!");
        if(exit) process.exit(0);
      }
    });
  });
}

let cache = redis.createClient(process.env.REDIS_URL);
if(process.env.REDIS_FLUSH) cache.flushdb();

let reqs = [];
let toEmail;

req(process.env.SOURCE_PATH).then((content)=>{
  let parsed = jsYaml.safeLoad(content);
  toEmail = parsed.email;
  return parsed.busquedas
}).then((busquedas)=>{
  busquedas.forEach((b,i)=>{
    let name = b.nombre;
    let r = req(b.url, reqOptions).then((body)=>{
    
    return cheerio.load(body)
    }).then(($)=>{
      let $ads = $(".listing_thumbs .ad"),
          ads = [];
      $ads.each((i, el)=>{
        let ad = {
          id    : $(el).attr('id').trim(),
          title : $(el).find('.title').text().trim(),
          url   : $(el).find('.title').attr('href').trim(),
          price : $(el).find('.price').text().trim(),
          html  : $(el).html(),
        };
        ads.push(ad);
      });
      return ads
    }).then((ads)=>{
      return cache.mget(ads.map(a=>a.id))
      .then(function (caches) {
        let group = {};
        group.title = name;
        group.items = [];
        ads.forEach((ad,i)=>{
          if (caches[i]){
            let cached = JSON.parse(caches[i]);
            // console.log(ad.id, "exists for", name)
            // console.log(`price from ${cached.price} to ${ad.price}`)
            // console.log(cached.price == ad.price ? "same price" : "different price")
          } else {
            // console.log(ad.id, "is new for", name)
            group.items.push(ad.html);
            cache.set(ad.id, JSON.stringify(ad));
          }
        });
        return group
      })
    }).then((group)=>{
      if (group.items.length < 1){ 
        console.log('nada nuevo para ', name);
        return null
      }
      else return group
    }).catch((e)=>{
      console.log(e);
    });
    reqs.push(r);
  });

  Promise.all(reqs).then((groups)=>{
    groups = _.compact(groups);
    if (groups.length > 0) {
      console.log(`enviando notificaciones a ${toEmail}`);
      sendEmail(makeEmail(groups), toEmail, true);
    } else {
      console.log('nada que reportar');
      process.exit(0);
    }
  });
});
