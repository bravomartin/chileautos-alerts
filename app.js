import _ from "lodash";
import { safeLoad } from "js-yaml";
import cheerio from "cheerio";
import req from "request-promise-native";

import redis from "then-redis";
let cache = redis.createClient(process.env.REDIS_URL);
if (process.env.REDIS_FLUSH) cache.flushdb();

import { sendEmail, makeEmail, reqOptions, parseMoney } from "./functions";

let reqs = [];
let toEmail;

req(process.env.SOURCE_PATH)
  .then(content => {
    let parsed = safeLoad(content);
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
          if ($(".redwarning_failover").text() == "Resultado no encontrado.") {
            $(".listing_thumbs").empty();
          }
          return $;
        })
        .then($ => {
          let $ads = $(".listing_thumbs .ad"),
            ads = [];
          $ads.each((i, el) => {
            let ad = {
              id: $(el).attr("id").trim(),
              html: $(el).html()
            };
            ads.push(ad);
          });
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
            console.log("nada nuevo para ", name);
            return null;
          } else {
            console.log("%s nuevos para %s", group.items.length, name);
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
        sendEmail(makeEmail(groups), toEmail, true);
      } else {
        console.log("nada que reportar");
        process.exit(0);
      }
    });
  });
