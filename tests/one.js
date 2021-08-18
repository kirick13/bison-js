
require('./prototype-extensions.js'); // eslint-disable-line import/no-unassigned-import
const BiSON = require('../main.js');

const data = [
	'привет мир',
];
console.log('data', data);

const encoded_bison = BiSON.encode(data);
console.log('encoded bison', encoded_bison);
const encoded_bison_length = encoded_bison.byteLength;
console.log('encoded bison length', encoded_bison_length);

const encoded_json = JSON.stringify(data);
console.log('encoded json', encoded_json);
const encoded_json_length = new TextEncoder().encode(encoded_json).byteLength;
console.log('encoded json length', encoded_json_length);

const data_decoded = BiSON.decode(encoded_bison);
console.log();
console.log('decoded bison', data_decoded);
