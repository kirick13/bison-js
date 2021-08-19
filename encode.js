
const {
	shared_data_view,
	IS_NODEJS_BUFFER_SUPPORTED,
} = require('./env');

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray
const TYPED_ARRAY_CONSTRUCTORS = new Set([ 'Buffer', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array' ]);
const ASCII_REGEXP = /[^\u{00}-\u{FF}]/u;
const TEXT_ENCODER = new TextEncoder();

let bytes32 = [];
let bits_value = 0;
let bits_used = 0;
const clear = () => {
	bytes32 = [];
	bits_value = 0;
	bits_used = 0;
};
const append = (value, bits_count) => {
	// ---
	if (0 === bits_used) {
		if (32 === bits_count) {
			bytes32.push(value);
		}
		else {
			bits_value = value;
			bits_used = bits_count;
		}
	}
	else {
		if (bits_used + bits_count >= 32) {
			let bits_to_read = 32 - bits_used;
			if (bits_to_read > bits_count) {
				bits_to_read = bits_count;
			}

			const value_shift = bits_count - bits_to_read;

			bytes32.push(
				(bits_value << bits_to_read) | (value >>> value_shift),
			);

			value &= (1 << value_shift) - 1;
			bits_count -= bits_to_read;

			bits_value = 0;
			bits_used = 0;
		}

		if (bits_count > 0) {
			bits_value = (bits_value << bits_count) | value;
			bits_used += bits_count;
		}
	}

	return this;
};
const getArrayBuffer = () => {
	const data_buffer_length = bytes32.length;
	const data_buffer_bytes = data_buffer_length * 4;

	const additional_bytes = Math.ceil(bits_used / 8);

	const buffer_length = data_buffer_bytes + additional_bytes;

	const array_buffer = new ArrayBuffer(buffer_length);
	const data_view = new DataView(array_buffer);

	for (let index = 0; index < data_buffer_length; index++) {
		data_view.setInt32(
			index * 4,
			bytes32[index],
		);
	}

	if (bits_used > 0) {
		let value = bits_value << ((additional_bytes * 8) - bits_used);

		for (let index = buffer_length - 1; value !== 0; index--) {
			data_view.setUint8(
				index,
				value & 0xFF,
			);

			value >>>= 8;
		}
	}

	return array_buffer;
};
const getBuffer = () => {
	return Buffer.from(
		getArrayBuffer(),
	);
};

module.exports = (
	data,
	{
		is_buffer = false,
	} = {},
) => {
	clear();

	append(
		0b0,
		1,
	);
	encode(data);

	return is_buffer ? getBuffer() : getArrayBuffer();
};

const encode = (value) => {
	const value_type = typeof value;

	if (null === value) {
		append(
			0b0000,
			4,
		);
	}
	else if ('boolean' === value_type) {
		append(
			0b110_0 | Number(value),
			4,
		);
	}
	else if ('number' === value_type) {
		if (Number.isInteger(value)) {
			if (value >= 0) {
				encodeUint(value);
			}
			else {
				encodeInt(value);
			}
		}
		else {
			encodeDouble(value);
		}
	}
	else if ('bigint' === value_type) {
		if (value >= 0) {
			encodeUint(value);
		}
		else {
			encodeInt(value);
		}
	}
	else if ('string' === value_type) {
		encodeString(value);
	}
	else if (Array.isArray(value)) {
		encodeArray(value);
	}
	else if (IS_NODEJS_BUFFER_SUPPORTED && Buffer.isBuffer(value)) {
		encodeBuffer(value);
	}
	else if (value instanceof ArrayBuffer) {
		encodeBuffer(value);
	}
	else if (TYPED_ARRAY_CONSTRUCTORS.has(value.constructor.name)) {
		encodeBuffer(value.buffer);
	}
	else if ('object' === value_type && 'Object' === value.constructor.name) {
		encodeHash(value);
	}
	else {
		console.error(value);
		throw new Error('Unknown type.');
	}
};
const encodeInt = (value) => { // eslint-disable-line complexity
	const is_bigint = typeof value === 'bigint';
	if (!is_bigint && value < Number.MIN_SAFE_INTEGER) {
		throw new Error(`Number ${value} is not safe.`);
	}

	// right here we will strip all bits on the left side
	// examples
	// -100 as int8:
	// // -100 is 0b11111111_11111111_11111111_10011100 as int32 number
	// // strip all fits except less significant 8 by (x & 0xFF)
	// // result is 0b00000000_00000000_00000000_10011100
	// // 0b10011100 is -100 in int8 format

	// int8
	if (value >= -128 && value <= 127) {
		append(
			(0b0100_00 << 8) | (value & 0xFF),
			14, // 4 + 2 + 8
		);
	}
	// int16
	else if (value >= -32_768 && value <= 32_767) {
		append(
			(0b0100_01 << 16) | (value & 0xFFFF),
			22, // 4 + 2 + 16
		);
	}
	// int32
	else if (value >= -2_147_483_648 && value <= 2_147_483_647) {
		append(
			0b0100_10,
			6,
		);
		append(
			Number(value),
			32,
		);
	}
	// int2048
	else {
		const is_value_negative = value < 0;
		const denominator = is_bigint ? 0x100n : 0x100;
		const number_one = is_bigint ? 1n : 1;
		const xff = is_bigint ? 0xFFn : 0xFF;

		const bytes = [];
		for (
			let value_this = (is_value_negative ? -(value + number_one) : value);
			value_this !== (is_bigint ? 0n : 0);
		) {
			let byte = value_this % denominator;
			if (is_value_negative) {
				byte = ~byte & xff;
			}
			bytes.unshift(
				is_bigint ? Number(byte) : byte,
			);

			if (is_bigint) {
				value_this /= denominator;
			}
			else {
				// Math.trunc() is 10% slower
				// but mind this => "3000000000.1 | 0 = -1294967296"
				value_this = Math.trunc(value_this / denominator);
			}
		}

		const sign_bit = bytes[0] >>> 7;
		// console.log('sign_bit', sign_bit);
		if (!is_value_negative && 0 !== sign_bit) {
			bytes.unshift(0);
		}
		else if (is_value_negative && 1 !== sign_bit) {
			bytes.unshift(0xFF);
		}

		// shared_data_view.setBigInt64(
		// 	0,
		// 	BigInt(value),
		// );
		// console.log('result buffer', shared_array_buffer);
		// console.log('result buffer', Array.from(new Uint8Array(shared_array_buffer)).map(byte => BitBuffer.numberToBits(byte).slice(-8)).join(' '));
		// console.log('result bytes', bytes.map(a => (a < 16 ? '0' : '') + a.toString(16)).join(' '));

		append(
			(0b0100_11 << 8) | bytes.length,
			14, // 4 + 2 + 8
		);

		for (const byte of bytes) {
			append(
				byte,
				8,
			);
		}
	}
};
const encodeUint = (value, add_type_id = true) => {
	if (value < 0) {
		throw new Error(`Number ${value} is signed, expected usigned.`);
	}

	const is_bigint = typeof value === 'bigint';
	if (!is_bigint && value > Number.MAX_SAFE_INTEGER) {
		throw new Error(`Number ${value} is not safe.`);
	}

	const type_id = add_type_id ? (0b0101 << 2) : 0;
	const type_id_bits = add_type_id ? 4 : 0;

	// uint8
	if (value <= 0xFF) {
		append(
			(type_id << 8) | Number(value),
			type_id_bits + 10, // + 2 + 8
		);
	}
	// uint16
	else if (value <= 0xFF_FF) {
		append(
			((type_id | 0b01) << 16) | Number(value),
			type_id_bits + 18, // + 2 + 16
		);
	}
	// uint32
	else if (value <= 0xFF_FF_FF_FF) {
		append(
			type_id | 0b10,
			type_id_bits + 2,
		);
		append(
			// i know what i'm doing
			// we need to convert uint32 to int32
			// numbers greater than 2_147_483_647 must become signed
			// it's an equivalent of:
			// shared_data_view.setUint32(0, value)
			// shared_data_view.getInt32(0)
			Number(value) >> 0, // eslint-disable-line unicorn/prefer-math-trunc
			32,
		);
	}
	// uint2048
	else {
		const denominator = is_bigint ? 0x1_00_00_00_00n : 0x1_00_00_00_00;

		const bytes32 = [];
		let last_bytes = 0;
		let last_bytes_count = 0;

		while (value > 0) {
			const bytes_this = Number(value % denominator);

			if (is_bigint) {
				value /= denominator;
			}
			else {
				// Math.trunc() is 10% slower
				// but mind this => "3000000000.1 | 0 = -1294967296"
				value = Math.trunc(value / denominator);
			}

			// 32-bit number
			if (value > 0 || bytes_this > 0xFF_FF_FF) {
				bytes32.unshift(bytes_this);
			}
			else {
				last_bytes = bytes_this;

				// 24-bit number
				if (bytes_this > 0xFF_FF) {
					last_bytes_count = 3;
				}
				else if (bytes_this > 0xFF) {
					last_bytes_count = 2;
				}
				else {
					last_bytes_count = 1;
				}
			}
		}

		append(
			((type_id | 0b11) << 8) | (last_bytes_count + (bytes32.length * 4)),
			type_id_bits + 10, // + 2 + 8
		);

		if (last_bytes_count > 0) {
			append(
				last_bytes,
				8 * last_bytes_count,
			);
		}

		for (const byte of bytes32) {
			append(
				byte,
				32,
			);
		}
	}
};
const encodeFloat = (value) => {
	// --
	append(
		0b0110,
		4,
	);

	shared_data_view.setFloat32(0, value);

	append(
		shared_data_view.getInt32(0),
		32,
	);
};
const encodeDouble = (value) => {
	// ---
	append(
		0b0111,
		4,
	);

	shared_data_view.setFloat64(0, value);

	append(
		shared_data_view.getInt32(0),
		32,
	);
	append(
		shared_data_view.getInt32(4),
		32,
	);
};
const encodeBuffer = (value, add_type_id = true) => {
	if (add_type_id) {
		append(
			0b100,
			3,
		);
	}

	if (value instanceof ArrayBuffer) {
		const data_view = new DataView(value);
		const bytes_count = value.byteLength;

		encodeUint(bytes_count, false);

		for (
			let bytes_left = bytes_count, index = 0;
			bytes_left > 0;
			index = bytes_count - bytes_left
		) {
			if (bytes_left >= 4) {
				append(
					data_view.getInt32(index),
					32,
				);

				bytes_left -= 4;
			}
			else {
				append(
					data_view.getUint8(index),
					8,
				);

				bytes_left--;
			}
		}
	}
	else if (IS_NODEJS_BUFFER_SUPPORTED && Buffer.isBuffer(value)) {
		const bytes_count = value.length;

		encodeUint(bytes_count, false);

		for (
			let bytes_left = bytes_count, index = 0;
			bytes_left > 0;
			index = bytes_count - bytes_left
		) {
			if (bytes_left >= 4) {
				append(
					value.readInt32BE(index),
					32,
				);

				bytes_left -= 4;
			}
			else {
				append(
					value[index],
					8,
				);

				bytes_left--;
			}
		}
	}
};
const encodeString = (value, add_type_id = true) => {
	// ---
	if (add_type_id) {
		append(
			0b101,
			3,
		);
	}

	if (ASCII_REGEXP.test(value) === false) {
		encodeUint(value.length, false);

		// console.log('ascii only');
		for (let index = 0; index < value.length; index++) {
			append(
				value.charCodeAt(index),
				8,
			);
		}
	}
	else {
		let buffer;
		if (IS_NODEJS_BUFFER_SUPPORTED) {
			buffer = Buffer.from(value, 'utf-8');
		}
		else {
			buffer = TEXT_ENCODER.encode(value).buffer;
		}

		encodeBuffer(
			buffer,
			false,
		);
	}
};
const encodeArray = (value) => {
	// ---
	append(
		0b0010,
		4,
	);

	for (const element of value) {
		encode(element);
	}

	append(
		0b111,
		3,
	);
};
// const encodeTypedArray = (value) => {
// 	//
// };
const encodeHash = (value) => {
	// ---
	append(
		0b0001,
		4,
	);

	for (const key of Object.keys(value)) {
		encode(value[key]);
		encodeString(key, false);
	}

	append(
		0b111,
		3,
	);
};
