
const shared_uint8_array = exports.shared_uint8_array = new Uint8Array(8);
const shared_array_buffer = exports.shared_array_buffer = shared_uint8_array.buffer;
exports.shared_data_view = new DataView(shared_array_buffer);

exports.TERMINATOR_VALUE = Symbol('BISON.TERMINATOR');

exports.IS_NODEJS_BUFFER_SUPPORTED = (() => {
	try {
		Buffer.from([ 0 ]);
		return true;
	}
	catch {
		return false;
	}
})();
