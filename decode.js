
const {
	shared_uint8_array,
	shared_data_view,
	TERMINATOR_VALUE,
	IS_NODEJS_BUFFER_SUPPORTED,
} = require('./env');

const text_decoder = new TextDecoder('utf-8');

let payload;
let read_index = 0;
const read = (bits_count) => {
	let index_byte = read_index >>> 3;
	let index_bit = read_index & 0b111;

	read_index += bits_count;

	let result = 0;
	while (bits_count > 0) {
		const byte = payload[index_byte];

		if (0 === index_bit && bits_count >= 8) {
			result = (result << 8) | byte;

			bits_count -= 8;
		}
		else {
			const bits_remaining_on_byte = 8 - index_bit;

			let bits_drop_right;
			let bits_read;
			if (bits_remaining_on_byte > bits_count) {
				bits_drop_right = bits_remaining_on_byte - bits_count;
				bits_read = bits_count;
			}
			else {
				bits_drop_right = 0;
				bits_read = bits_remaining_on_byte;
			}

			const shift_left = 24 + index_bit;
			const shift_right = shift_left + bits_drop_right;

			result = (result << bits_read) | (byte << shift_left >>> shift_right);

			bits_count -= bits_read;
		}

		index_byte++;
		index_bit = 0;
	}

	return result;
};
const readBytes = (bytes_count, is_shared = false) => {
	let index_byte = read_index >>> 3;
	const index_bit = read_index & 0b111;

	read_index += bytes_count * 8;

	const shift_now_left = 24 + index_bit;
	const shift_now_right = shift_now_left - index_bit;
	const shift_next_right = 8 - index_bit;

	const result = is_shared ? shared_uint8_array : new Uint8Array(bytes_count);
	for (
		let index = 0;
		index < bytes_count;
		index++, index_byte++
	) {
		const byte_now = payload[index_byte];
		const byte_next = payload[index_byte + 1];

		result[index] = (byte_now << shift_now_left >>> shift_now_right) | (byte_next >>> shift_next_right);
	}

	return result;
};

module.exports = (array_buffer) => {
	payload = new Uint8Array(array_buffer);
	read_index = 0;

	const payload_type_bit = read(1);

	if (0 === payload_type_bit) {
		return decode();
	}
	else {
		throw new Error('Schema reading is not supported yet.');
	}
};

const getTypeID = () => {
	// leading 1 is required to prevent collisions between bits "0100" (unsigned integer) and "100" (buffer) interpreted as numbers
	// leading zero bit is important!
	let type_id = (1 << 2) | read(2);
	// console.log('type_id', type_id.toString(2).slice(1));

	switch (type_id) {
		// 2 more bits to determine a type
		// null, array, typed array, hash
		// int, uint, float, double
		case 0b1_00:
		case 0b1_01: {
			type_id <<= 2;
			type_id |= read(2);
		} break;
		// 1 more bit to determine a type
		// buffer, string
		// boolean, terminator
		case 0b1_10:
		case 0b1_11: {
			type_id <<= 1;
			type_id |= read(1);
		} break;
		default: break;
	}

	return type_id;
};

const decode = () => {
	const type_id = getTypeID();

	switch (type_id) {
		// null
		case 0b1_0000:
			return null;
		// hash
		case 0b1_0001:
			return readHash();
		// array
		case 0b1_0010:
			return readArray();
		// typed array
		// case 0b1_0011:
		// 	return readTypedArray();
		// int
		case 0b1_0100:
			return readInt();
		// uint
		case 0b1_0101:
			return readUint();
		// float (float32)
		case 0b1_0110:
			return readFloat();
		// double (float64)
		case 0b1_0111:
			return readDouble();
		// buffer
		case 0b1_100:
			return readBuffer();
		// string
		case 0b1_101:
			return readString();
		// boolean
		case 0b1_110:
			return 1 === read(1);
		// terminator
		case 0b1_111:
			return TERMINATOR_VALUE;
		default:
			throw new Error(`Read error: invalid TypeID "${type_id.toString(2).slice(1)}".`);
	}
};
const readInt = () => {
	const subtype = read(2);

	switch (subtype) {
		// int8
		case 0b00:
			readBytes(1, true);
			return shared_data_view.getInt8(0);
		// int16
		case 0b01:
			readBytes(2, true);
			return shared_data_view.getInt16(0);
		// int32
		case 0b10:
			readBytes(4, true);
			return shared_data_view.getInt32(0);
		// int2048
		default: {
			const bytes_count = read(8);

			// const is_bigint = bytes_count > 6;
			// const multiplier = is_bigint ? 0x100n : 0x100;

			let is_bigint = false;
			let value = is_bigint ? 0n : 0;
			let sign_bit;
			for (let byte_index = 0; byte_index < bytes_count; byte_index++) {
				let byte = read(8);

				if (0 === byte_index) {
					sign_bit = byte >>> 7;
				}

				if (1 === sign_bit) {
					byte = ~byte;
				}

				byte &= (0 === byte_index) ? 0x7F : 0xFF;

				// value *= multiplier;
				// value += is_bigint ? BigInt(byte) : byte;
				if (is_bigint) {
					value = (value * 0x100n) + BigInt(byte);
				}
				else {
					const value_before = value;

					value = (value * 0x100) + byte;

					if (value > Number.MAX_SAFE_INTEGER) {
						value = (BigInt(value_before) * 0x100n) + BigInt(byte);
						is_bigint = true;
					}
				}
			}

			if (1 === sign_bit) {
				value += is_bigint ? 1n : 1;
				value = -value;
			}

			return value;
		}
	}
};
const readUint = () => {
	const subtype = read(2);

	switch (subtype) {
		// uint8
		case 0b00:
			return read(8);
		// uint16
		case 0b01:
			return read(16);
		// uint32
		case 0b10:
			return read(32) >>> 0;
		// uint2048
		default: {
			const bytes_count = read(8);
			// const bytes_count = readBytes(1, true)[0];
			// const bytes = readBytes(bytes_count);

			let is_bigint = false;
			let value = 0;
			for (let byte_i = 0; byte_i < bytes_count; byte_i++) {
			// for (const byte of bytes) {
				const byte = read(8);

				if (is_bigint) {
					value = (value * 0x100n) + BigInt(byte);
				}
				else {
					const value_before = value;

					value = (value * 0x100) + byte;

					if (value > Number.MAX_SAFE_INTEGER) {
						value = (BigInt(value_before) * 0x100n) + BigInt(byte);
						is_bigint = true;
					}
				}
			}

			return value;
		}
	}
};
const readFloat = () => {
	shared_data_view.setInt32(
		0,
		read(32),
	);

	return shared_data_view.getFloat32(0);
};
const readDouble = () => {
	shared_data_view.setInt32(
		0,
		read(32),
	);
	shared_data_view.setInt32(
		4,
		read(32),
	);

	return shared_data_view.getFloat64(0);
};
// 0 — ArrayBuffer
// 1 — Uint8Array
// 2 — NodeJS Buffer
const readBuffer = (return_type = 0) => {
	// ---
	const array = readBytes(
		readUint(),
	);

	if (2 === return_type) {
		return Buffer.from(array);
	}
	else if (0 === return_type) {
		return array.buffer;
	}
	else {
		return array;
	}
};
const readString = () => {
	if (IS_NODEJS_BUFFER_SUPPORTED) {
		return readBuffer(2).toString();
	}
	else {
		return text_decoder.decode(
			readBuffer(1),
		);
	}
};
const readArray = () => {
	const array = [];
	for (;;) {
		const element = decode();
		if (element === TERMINATOR_VALUE) {
			return array;
		}
		else {
			array.push(element);
		}
	}
};
// const readTypedArray = () => {
// 	//
// };
const readHash = () => {
	const hash = {};
	for (;;) {
		const value = decode();
		if (value === TERMINATOR_VALUE) {
			return hash;
		}
		else {
			const key = readString();
			hash[key] = value;
		}
	}
};
