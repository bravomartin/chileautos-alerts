import mailcomposer from 'mailcomposer'
import Mailgun from 'mailgun-js'
import nunjucks from 'nunjucks'
nunjucks.configure('.', { autoescape: true });
let mailgun = Mailgun({apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN});

let toEmail = process.env.TO_EMAIL

export function makeEmail(groups){
  return nunjucks.render('template.tmpl', {groups: groups})
}

export function parseMoney(str){
  return Number(str.replace(/[^0-9\,]+/g,""));
}

export function sendEmail(email, exit){
  
  let mail = mailcomposer({
    from: 'Yapo Alerts <alerts@sandboxdebf46a0d2c34fe390501cdd02ee004d.mailgun.org>',
    to: toEmail,
    subject: "Hay nuevas publicaciones en tus busquedas!",
    body: 'Abrelo...',
    html: email,
    encoding: 'utf-8'
  })

  mail.build( function(mailBuildError, message){
    console.log(`sending email to ${toEmail}`)
    let dataToSend = {
      to: toEmail,
      message: message.toString('ascii')
    }
    mailgun.messages().sendMime( dataToSend, (sendError, body)=>{
      if (sendError){
        console.error(sendError);
        if(exit) process.exit(1)
      } else {
        console.log("Success!")
        if(exit) process.exit(0)
      }
    })
  })
}