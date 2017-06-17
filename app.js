import fs from 'fs'

import _ from 'lodash'
import {safeLoad} from 'js-yaml'
import cheerio from 'cheerio'
import req from 'request-promise-native'

import {sendEmail, makeEmail} from './functions'
import redis from 'then-redis'

let cache = redis.createClient(process.env.REDIS_URL);

if(process.env.REDIS_FLUSH) cache.flushdb()

let reqOptions = { headers: {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'}}

let busquedasFile = fs.readFileSync('busquedas.yml', {encoding: 'utf8'})
let busquedas = safeLoad(busquedasFile)

let reqs = []
let updates = 0
Object.keys(busquedas).forEach((name,i)=>{
  let url = busquedas[name]
  let r = req(url, reqOptions).then((body)=>{
    return cheerio.load(body)
  }).then(($)=>{
    let $ads = $(".listing_thumbs .ad"),
        ads = []
    $ads.each((i, el)=>{
      let ad = {
        id    : $(el).attr('id').trim(),
        title : $(el).find('.title').text().trim(),
        url   : $(el).find('.title').attr('href').trim(),
        price : $(el).find('.price').text().trim(),
        html  : $(el).html(),
      }
      ads.push(ad)
    })
    console.log(ads.length, "ads found for", name)
    return ads
  }).then((ads)=>{
    return cache.mget(ads.map(a=>a.id))
    .then(function (caches) {
      let group = {}
      group.title = name
      group.items = []
      ads.forEach((ad,i)=>{
        if (caches[i]){
          let cached = JSON.parse(caches[i])
          // console.log(ad.id, "exists for", name)
          // console.log(`price from ${cached.price} to ${ad.price}`)
          // console.log(cached.price == ad.price ? "same price" : "different price")
        } else {
          // console.log(ad.id, "is new for", name)
          group.items.push(ad.html)
          cache.set(ad.id, JSON.stringify(ad))
          updates += 1
        }
      })
      return group
    })
  }).then((group)=>{
    if (group.items.length < 1){ 
      console.log('nothing new for ', name)
      return null
    }
    else return group
  }).catch((e)=>{
    console.log(e)
  })
  reqs.push(r)
})

Promise.all(reqs).then((groups)=>{
  console.log('all done')
  groups = _.compact(groups)
  if (groups.length > 0) {
    sendEmail(makeEmail(groups), true)
  } else {
    console.log('nothing new at all')
    process.exit(0)

  }
  
})