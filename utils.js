const fs = require('fs');
const { JSDOM } = require('jsdom');
const { spawn } = require('child_process');
const { safeLoad } = require('js-yaml');
const { Octokit } = require('@octokit/rest');
const mailcomposer = require('mailcomposer');
const Mailgun = require('mailgun-js');
const nunjucks = require('nunjucks');

// config

const octokit = new Octokit({
	auth: process.env.GITHUB_TOKEN
});

nunjucks.configure('.', { autoescape: true });

const mailgun = Mailgun({
	apiKey: process.env.MAILGUN_API_KEY,
	domain: process.env.MAILGUN_DOMAIN
});

//REQ
const host = 'https://www.chileautos.cl';

const curl = url => {
	return new Promise((resolve, reject) => {
		let res = '';
		const child = spawn(`curl`, [
			url,
			'-H',
			'authority: www.chileautos.cl',
			'-H',
			'cache-control: max-age=0',
			'-H',
			'upgrade-insecure-requests: 1',
			'-H',
			'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.122 Safari/537.36',
			'-H',
			'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
			'-H',
			'sec-fetch-site: same-origin',
			'-H',
			'sec-fetch-mode: navigate',
			'-H',
			'sec-fetch-user: ?1',
			'-H',
			'sec-fetch-dest: document',
			'-H',
			'referer: https://www.chileautos.cl/vehiculos/?q=(And.Servicio.ChileAutos._.TipoVeh%c3%adculo.Autos%2c+camionetas+y+4x4._.Marca.Toyota._.CarAll.keyword(2_.7+prado).)&offset=24',
			'-H',
			'accept-language: en-US,en;q=0.9,es;q=0.8',
			'-H',
			'cookie: _fbp=fb.1.1579544057708.960918247; _ga=GA1.2.638796359.1579544058; gaclientId=638796359.1579544058; DeviceId=351d3535-f5b8-44f0-bd0b-485d63170394; .AspNetCore.Antiforgery.NsPtgLTHySs=CfDJ8NtsynzkTvhOqu6Mz85IBFMS5r9Hj4XQCHFcJPgbNaY4B_jTe_lOZjv9YEoF6y5gWysyaCL_7iPSJCJxyYnwUurw3-JQd35uJnyJkGv45-DLx-WNNxoRzw4Qg5lq3yW6Xhmf56bNI9V6RcQ7Ta9jRqk; _hjid=eb3427ee-eec5-41ca-9a3d-f916bd37447e; p_csnclientid=6cc0bdb6-c364-70c8-aba9-41a10748db81; csnclientid=a7d2ba09-2167-a5c8-beb3-97bea722f808-40f237a6-88da-4e74-b398-a74915149f97-1582743772012; cidgenerated=client; XSRF-TOKEN=CfDJ8NtsynzkTvhOqu6Mz85IBFO0fZbiUTSoHH2cpKn2sR2EMyuqefmIoO9bZtw73A1ip5qexhrIL1PHG_7ThYfcDqunRvPg1KfxtgOAxMntkD6KNQxsqtPty98tJZ_vjTqTaVTEEqCLDfqtuomGuKwvqYs; cmp.ret.enq.afgtoken=CfDJ8Efs2BAxx71EoBhTrHnI3sMbzHNmlzhXThIHDMyteK064lgf_MDQ_Cs6w_1hQ0iVoFhIvWc6nrUIwuAsIkZ4GfCy3j0ueCke2bmG-wIrNOvIPQNykpkkPXdkMG_vWzQlep9DdLI5qYZcjS1gAxF0hUc; _gid=GA1.2.2112131611.1587835278; csn.bi=1587923238759',
			'--compressed'
		]);
		child.stdout.on('data', data => {
			res = res + data;
		});
		child.on('close', function(code) {
			resolve(res.toString());
		});
	});
};

const getResults = async (url, results = []) => {
	const res = await curl(url);
	const { document } = new JSDOM(res).window;
	const items = document.querySelectorAll('.listing-item');
	for (i in items) {
		const item = items[i];
		if (item.querySelector) {
			const result = {
				id: item.id,
				name: item.querySelector('h3').textContent,
				url: host + item.querySelector('h3 a').getAttribute('href'),
				price: parseMoney(item.querySelector('.price a').textContent),
				priceDisplay: item.querySelector('.price a').textContent.replace(/CLP\s*/g, ''),
				img: item.querySelector('.carousel-item img').getAttribute('src')
			};
			result.details = [];
			item.querySelectorAll('.key-detail').forEach(detail => {
				result.details.push({
					name: detail.querySelector('.key-detail-type').textContent,
					value: detail.querySelector('.key-detail-value').textContent
				});
			});
			results.push(result);
		}
		i++;
	}
	const next = document.querySelector('.page-link.next').getAttribute('href');
	if (next) return await getResults(host + next, results);
	return results;
};

//MONEY
function parseMoney(str) {
	return Number(str.replace(/[^0-9\,]+/g, ''));
}

// EMAIL
function composeEmail(groups) {
	return;
}

function sendEmail(data, toEmail) {
	console.log('Sending email...');
	const email = nunjucks.render('template.tmpl', { data });
	let mail = mailcomposer({
		from: 'Chileautos Alerts <alerts@sandboxdebf46a0d2c34fe390501cdd02ee004d.mailgun.org>',
		to: toEmail,
		subject: 'Hay nuevas publicaciones en tus busquedas!',
		body: 'Abrelo...',
		html: email,
		encoding: 'utf-8'
	});
	if (process.env.MOCK == 'true') {
		fs.writeFileSync('data/email.html', email, { encoding: 'utf-8' });
		console.log('saved to data/email.html');
	} else {
		mail.build(function(mailBuildError, message) {
			let dataToSend = {
				to: toEmail,
				message: message.toString('ascii')
			};
			mailgun.messages().sendMime(dataToSend, (sendError, body) => {
				if (sendError) {
					console.log('error sending email', sendError);
				} else {
					console.log('Email sent!');
				}
			});
		});
	}
}

// store

const getStore = async () => {
	if (process.env.NODE_ENV == 'development') {
		console.log('getting data from file system');
		return {
			state: JSON.parse(fs.readFileSync('./data/state.json', 'utf8')),
			config: safeLoad(fs.readFileSync('./data/config.yml', 'utf8'))
		};
	}

	const gist = await octokit.gists.get({
		gist_id: process.env.GIST_ID
	});

	const store = {};
	for (file in gist.data.files) {
		const { language, content } = gist.data.files[file];
		if (language == 'YAML') {
			store.config = safeLoad(content);
		} else if (language == 'JSON') {
			store.state = JSON.parse(content);
		}
	}
	return store;
};

const saveState = async state => {
	const content = JSON.stringify(state, null, 2);
	if (process.env.NODE_ENV == 'development') {
		fs.writeFileSync('./data/state.json', content, 'utf8');
	} else {
		try {
			await octokit.gists.update({
				gist_id: process.env.GIST_ID,
				files: {
					'state.json': {
						content
					}
				}
			});
		} catch (e) {
			console.log('error saving gist', e);
		} finally {
		}
	}
};

module.exports = { sendEmail, composeEmail, getStore, saveState, getResults };
