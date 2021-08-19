
require('./prototype-extensions.js'); // eslint-disable-line import/no-unassigned-import
const BiSON = require('../main.js');

const string_chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_'; // абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';

const COMPLEXITY = 4;

const randomBoolean = () => Math.random() < 0.5;
const randomNumber = (min, max) => Math.floor((Math.random() * (max - min + 1)) + min);
const randomBigInt = (bytes_count) => {
	let number = 1n;

	const bytes = require('crypto').randomBytes(bytes_count);
	for (const byte of bytes) {
		number *= 100n;
		number += BigInt(byte);
	}

	return number;
};

const getTimeFromHr = (value) => {
	const [ seconds, nanoseconds ] = process.hrtime(value);
	return (seconds * 1e3) + (nanoseconds / 1e6);
};

const generators = {
	boolean () {
		return randomBoolean();
	},
	int8 () {
		return randomNumber(-128, 127);
	},
	int16 () {
		return randomNumber(-32_768, 32_767);
	},
	int32 () {
		return randomNumber(-2_147_483_648, 2_147_483_647);
	},
	// int2048 () {
	// 	// number
	// 	if (randomBoolean()) {
	// 		return randomNumber(
	// 			Number.MIN_SAFE_INTEGER,
	// 			Number.MAX_SAFE_INTEGER,
	// 		);
	// 	}
	// 	else {
	// 		let number = randomBigInt(
	// 			randomNumber(8, 16),
	// 		);
	//
	// 		if (randomBoolean()) {
	// 			number *= -1n;
	// 		}
	//
	// 		return number;
	// 	}
	// },
	uint8 () {
		return randomNumber(0, 255);
	},
	uint16 () {
		return randomNumber(0, 65_535);
	},
	uint32 () {
		return randomNumber(0, 4_294_967_295);
	},
	// uint2048 () {
	// 	if (randomBoolean()) {
	// 		return randomNumber(
	// 			0,
	// 			Number.MAX_SAFE_INTEGER,
	// 		);
	// 	}
	// 	else {
	// 		return randomBigInt(
	// 			randomNumber(8, 16),
	// 		);
	// 	}
	// },
	// float () {
	// 	const array = new Uint8Array(
	// 		require('crypto').randomBytes(4),
	// 	);
	// 	return new DataView(array.buffer).getFloat32(0);
	// },
	double () {
		return Math.random();
	},
	buffer () {
		const bytes_count = randomNumber(0, 127);
		return require('crypto').randomBytes(bytes_count);
	},
	string (is_object_key = false) {
		const length = randomNumber(
			true === is_object_key ? 4 : 0,
			true === is_object_key ? 16 : 127,
		);

		let string = '';
		while (string.length < length) {
			string += string_chars[randomNumber(0, string_chars.length - 1)];
		}
		return string;
	},
	array (level) {
		const array = [];

		const elements_count_max = 2 ** (COMPLEXITY - level);
		const elements_count = randomNumber(
			Math.floor(elements_count_max / 2),
			elements_count_max,
		);

		for (let i = 0; i < elements_count; i++) {
			array.push(
				getRandomData(level + 1),
			);
		}

		return array;
	},
	hash (level) {
		const result = {};

		const elements_count_max = 2 ** (COMPLEXITY - level);
		const elements_count = randomNumber(
			Math.floor(elements_count_max / 2),
			elements_count_max,
		);

		for (let i = 0; i < elements_count; i++) {
			result[generators.string(true)] = getRandomData(level + 1);
		}

		return result;
	},
	null () {
		return null;
	},
};

const generators_names = Object.keys(generators);

const getRandomData = (level = 0) => {
	if (0 === level) {
		/* if (randomBoolean()) {
			return generators.hash(level);
		}
		else */ {
			return generators.array(level);
		}
	}
	else {
		const generators_names_index = randomNumber(
			0,
			generators_names.length - 1,
		);

		return generators[generators_names[generators_names_index]](level);
	}
};

let bison_total_length = 0;
let json_total_length = 0;

const timings = {
	encode: {
		bison: 0,
		json: 0,
	},
	decode: {
		bison: 0,
		json: 0,
	},
};

const hrtime_total = process.hrtime();
for (let i = 0; i < 1_000_000; i++) {
	// console.log('TEST #' + i);

	const data = getRandomData();
	// console.log('data', data);

	const hrtime_bison_encode = process.hrtime();
	const encoded_bison = BiSON.encode(data);
	timings.encode.bison += getTimeFromHr(hrtime_bison_encode);
	const encoded_bison_length = encoded_bison.byteLength;
	bison_total_length += encoded_bison_length;

	const hrtime_json_encode = process.hrtime();
	const encoded_json = JSON.stringify(data);
	timings.encode.json += getTimeFromHr(hrtime_json_encode);
	const encoded_json_length = new TextEncoder().encode(encoded_json).byteLength;
	json_total_length += encoded_json_length;

	const hrtime_bison_decode = process.hrtime();
	const data_decoded = BiSON.decode(encoded_bison);
	timings.decode.bison += getTimeFromHr(hrtime_bison_decode);

	const hrtime_json_decode = process.hrtime();
	JSON.parse(encoded_json);
	timings.decode.json += getTimeFromHr(hrtime_json_decode);

	const encoded_json_after_bison = JSON.stringify(data_decoded);
	const is_valid = encoded_json === encoded_json_after_bison;

	if (!is_valid) {
		console.log('INVALID RESULT');

		console.log('data', data);

		console.log('encoded bison', encoded_bison);

		console.log('encoded json', encoded_json);

		console.log();
		console.log('decoded bison', data_decoded);

		break;
	}

	if (getTimeFromHr(hrtime_total) > 10_000) { // 10 seconds
		console.log(`TEST COMPLETE (${i} runs)`);
		break;
	}
}

console.log();
console.log('efficiency size', Number.parseFloat((json_total_length / bison_total_length).toFixed(2)) + 'x');
console.log('efficiency time encode', Number.parseFloat((timings.encode.json / timings.encode.bison).toFixed(2)) + 'x');
console.log('efficiency time decode', Number.parseFloat((timings.decode.json / timings.decode.bison).toFixed(2)) + 'x');
