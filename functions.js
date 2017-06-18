import mailcomposer from 'mailcomposer'
import Mailgun from 'mailgun-js'
import nunjucks from 'nunjucks'
nunjucks.configure('.', { autoescape: true });
let mailgun = Mailgun({apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN});

//REQ
export let reqOptions = { headers: {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
  'Cache-Control': 'no-cache'
}}

//MONEY
export function parseMoney(str){
  return Number(str.replace(/[^0-9\,]+/g,""));
}

// EMAIL
export function makeEmail(groups){
  return nunjucks.render('template.tmpl', {groups: groups})
}

export function sendEmail(email, toEmail, exit){
  let mail = mailcomposer({
    from: 'Yapo Alerts <alerts@sandboxdebf46a0d2c34fe390501cdd02ee004d.mailgun.org>',
    to: toEmail,
    subject: "Hay nuevas publicaciones en tus busquedas!",
    body: 'Abrelo...',
    html: email,
    encoding: 'utf-8'
  })

  mail.build( function(mailBuildError, message){
    let dataToSend = {
      to: toEmail,
      message: message.toString('ascii')
    }
    mailgun.messages().sendMime( dataToSend, (sendError, body)=>{
      if (sendError){
        console.error(sendError);
        if(exit) process.exit(1)
      } else {
        console.log("Email sent!")
        if(exit) process.exit(0)
      }
    })
  })
}