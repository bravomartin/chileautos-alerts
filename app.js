const _ = require('lodash');

const { sendEmail, composeEmail, getStore, saveState, getResults } = require('./utils');

const app = async () => {
	const store = await getStore();
	const email = [];
	const promises = store.config.searches.map(async b => {
		console.log('Searching for new:', b.name);
		const results = await getResults(b.url);
		const newResults = [];
		results.forEach(result => {
			return newResults.push(result);
			const existing = store.state[b.name] && store.state[b.name].find(r => r.id == result.id);
			if (!existing) return newResults.push(result);

			if (existing.price != result.price) {
				result.oldPrice = existing.priceDisplay || existing.price;
				newResults.push(result);
			}
		});
		if (newResults.length) {
			const newGroup = { name: b.name, items: newResults };
			if (b.email) sendEmail([newGroup], b.email);
			email.push(newGroup);
		}
		store.state[b.name] = results;
	});
	await Promise.all(promises);
	if (email.length) sendEmail(email, store.config.email);
	saveState(store.state);
};

app();
