# bison-js
BISON provides a binary JSON implementation with some extentions that JSON doesn't support, e.g. binary buffers, single-precision `Floats` (aka `float32`) and `BigInt`.

# Size and speed
BISON output is `30%...40%` smaller than JSON output (buffers encoded as `base64`, `BigInt`s encoded as `String`).

But BISON takes `30%` more time to encode and `20%` more time to decode if there is no `Number`s or `BigInt`s larger than 32 bits. If so, BISON is much slower, down to `60%`. Sad but true.

If you can help me to optimise encoding and decoding, feel free to create an issue.

# Special thanks
Thanks to [@BonsaiDen](https://github.com/BonsaiDen) and his [BiSON.js](https://github.com/BonsaiDen/BiSON.js) package (that seems abandoned for years). I have got some ideas and inspiration from his docs and code. I wrote my package by myself from ground up, so it is not a fork, it's totally new and incompatible implementation.

# How to use
First, install the package with `npm install @kirick/bison`.

Then
```js
const BISON = require('@kirick/bison');

const data = {
  hello: 'world',
  foo: 123456,
  bar: 2856.004382,
  baz: Buffer.from([ 0xDE, 0xAD, 0xBE, 0xEF ]),
};

const payload = BISON.encode(data);

/*
payload now is
ArrayBuffer {
  [Uint8Contents]: <75 01 5d db dc 9b 19 00 56 86 56 c6 c6 f5 80 00 78 90 00 36 66 f6 f7 40 a6 50 02 3e 5b 85 62 00 d8 98 5c a0 09 bd 5b 7d de 01 b1 30 bd 00>,
  byteLength: 46
}
*/
```

# How it works?
BISON supports many types of data:
- `null`;
- `boolean`;
- `int` and `uint` up to **2048 bits**;
- `float` and `double`,
- buffers like `ArrayBuffer`, `TypedArray` and NodeJS' `Buffer`;
- `string`;
- `array`;
- `hash`.

Each type has its specific encoding started with 3- or 4-bits of `TypeID` followed (or not) by some data bits.

Please note that every BISON payload starts with bit `0` indicates that it's a JSON-like payload contains all necessary data to decode it (like TypeIDs and other data headers).
In future, BISON will support *schemas* (payload's first bit is `1`) that will allow you to cut out TypeID bits, `int` and `uint` subtypes, `buffer`/`string` lengths and much more to save even more data.

### Type `terminator`
Terminator indicates the end of `array` or `hash`. It's acting like an element of collection, but it's of course virtual.
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `3` | `000` (TypeID)

### Type `boolean`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `3` | `001` (TypeID)
`3` | `1` | `0` for `false`<br>`1` for `true`

### Type `int8`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `0100` (TypeID)
`4` | `2` | `00` (subtype `int8`)
`6` | `8` | data

### Type `int16`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `0100` (TypeID)
`4` | `2` | `01` (subtype `int16`)
`6` | `16` | data

### Type `int32`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `0100` (TypeID)
`4` | `2` | `10` (subtype `int32`)
`6` | `32` | data

### Type `int2048`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `0100` (TypeID)
`4` | `2` | `11` (subtype `int2048`)
`6` | `8` | `<number_bytes_count>` <br> unsigned integer, contains number of **bytes** that stores the number
`14` | `<number_bytes_count> * 8` | data

### Type `uint8`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `0101` (TypeID)
`4` | `2` | `00` (subtype `uint8`)
`6` | `8` | data

### Type `uint16`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `0101` (TypeID)
`4` | `2` | `01` (subtype `uint16`)
`6` | `16` | data

### Type `uint32`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `0101` (TypeID)
`4` | `2` | `10` (subtype `uint32`)
`6` | `32` | data

### Type `uint2048`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `0101` (TypeID)
`4` | `2` | `11` (subtype `uint2048`)
`6` | `8` | `<number_bytes_count>` <br> unsigned integer, contains number of **bytes** that stores the number
`14` | `<number_bytes_count> * 8` | data

### Type `float`
Single-precision float, aka `float32`.
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `0110` (TypeID)
`4` | `32` | data

### Type `double`
Double-precision float, aka `float64`.
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `0111` (TypeID)
`4` | `64` | data

### Type `buffer`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `3` | `100` (TypeID)
`4` | `<uint_length>` | unsigned integer of any subtype, but with no TypeID bits; <br> indicates the length of the buffer in **bytes**
`4 + <uint_length>` | `<buffer_bytes_count> * 8` | data

### Type `string`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `3` | `101` (TypeID)
`4` | `<uint_length>` | unsigned integer of any subtype, but with no TypeID bits; <br> indicates the length of the string in **bytes**
`4 + <uint_length>` | `<string_bytes_count> * 8` | data

### Type `array`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `3` | `1100` (TypeID)
`4` | `<array_body_length>` | data; <br> all values until `terminator` value will be appended to the array
`4 + <array_body_length>` | `3` | `000` type `terminator`

### Type `typed array`
⚠️ **WARNING**: this type isn't implemented.
That type has no sense in case of JSON-like encoding due to type checks, but it can help to encode schemas.
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `3` | `1101` (TypeID)
`4` | `<type_id_length>` | TypeID (3 or 4 bits) of every elements in the array
`4 + <type_id_length>` | `<uint_length>` | unsigned integer of any subtype, but with no TypeID bits; <br> indicates the count of elements in the array
`4 + <type_id_length> + <uint_length>` | `<array_body_length>` | data <br> all values will be appended to the array <br> no value has TypeID bits

### Type `hash`
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `3` | `1110` (TypeID)
`4` | `<hash_body_length>` | data; <br> all values until `terminator` value will be appended to current hash
`4 + <hash_body_length>` | `3` | `000` type `terminator`

Hash's body has it's own format:
1. `value` of any type (excl. `terminator`)
2. `key`: it's a `string` with no TypeID bits.

If the value you've read is `terminator`, you don't need to read the key.

### Type `null`
Yep, here must be a `terminator` and `null` should have TypeID `000`... but `array`s and `hash`es are more common than `null`s, so I'm decided to save one more bit.
Bit offset | Bits count | Description
------------ | ------------- | -------------
`0` | `4` | `1111` (TypeID)

