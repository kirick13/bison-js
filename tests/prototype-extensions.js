
const { Buffer, btoa } = (() => {
	try {
		return window; // eslint-disable-line no-undef
	}
	catch {}

	try {
		return global;
	}
	catch {}

	try {
		return self; // eslint-disable-line no-undef
	}
	catch {}
})();

BigInt.prototype.toJSON = function () { // eslint-disable-line no-extend-native
	return this.toString();
};
ArrayBuffer.prototype.toJSON = function () { // eslint-disable-line no-extend-native, no-use-extend-native/no-use-extend-native
	if (Buffer) {
		return Buffer.from(this).toJSON();
	}
	else if (btoa) {
		let binary = '';
		const bytes = new Uint8Array(this);
		const length = bytes.byteLength;
		for (let i = 0; i < length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary).replace(/=/g, '');
	}
};

if (Buffer) {
	Buffer.prototype.toJSON = function () {
		return this.toString('base64').replace(/=/g, '');
	};
}
