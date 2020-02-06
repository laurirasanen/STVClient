export enum SeekOrigin {
    Begin,
    Current,
    End
}

export class BinaryReader {
    private readonly buffer: Buffer;
    private offset: number;

    constructor(buffer: Buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    seek(offset: number, origin: SeekOrigin): number {
        switch (origin) {
            case SeekOrigin.Begin:
                return this.offset = offset;
            case SeekOrigin.End:
                return this.offset = this.buffer.byteLength * 8 - offset;
            default:
                return this.offset = this.offset + offset;
        }
    }

    getOffset(): number {
        return this.offset;
    }

    getRemaining(): number {
        return this.buffer.byteLength * 8 - this.offset;
    }

    copy = (target: Buffer, offset: number = 0) => {
        for (let i = 0; i < this.buffer.byteLength - offset; i++) {
            target.writeUInt8(this.buffer.readUInt8(i + offset), i);
        }
    }

    readBitsUint(amount: number): number {
        if (amount > 32) {
            throw("Tried to read number from more than 32 bits");
        }

        var bits = this.readBits(amount);
        var value = 0;
        for (let i = 0; i < amount; i++) {
            if (bits[i]) {
                value += 2**i;
            }
        }

        return value;
    }

    readBits(amount: number): Array<boolean> {
        var arr = new Array<boolean>(amount);
        for (let i = 0; i < amount; i++) {
            // this is gonna be terribly inefficient...
            // going to read the same byte from stream
            // 8 times to get 8 bits...
            arr[i] = this.readOneBit();
        }

        return arr;
    }

    readOneBit(): boolean {
        var bitOffset = this.offset % 8;
        var byteOffset = (this.offset - bitOffset) / 8;
        var byte = this.buffer.readUInt8(byteOffset);
        this.offset++;
        return ((byte & 2**bitOffset) === 2**bitOffset);
    }

    readBytes(amount: number): Array<number> {
        var bytes = new Array<number>(amount);
        for (let i = 0; i < amount; i++) {
            bytes[i] = this.readUint8();
        }
        return bytes;
    }

    readBoolean(): boolean {
        const value = this.readUint8();
        return value !== 0;
    }

    readUint8(): number {
        if (this.offset % 8) {
            throw("Not aligned to byte");
        }
        const value = this.buffer.readUInt8(this.offset / 8);
        this.offset += 8;
        return value;
    }

    readUint16(): number {
        if (this.offset % 8) {
            throw("Not aligned to byte");
        }
        const value = this.buffer.readUInt16LE(this.offset / 8);
        this.offset += 16;
        return value;
    }

    readInt32(): number {
        if (this.offset % 8) {
            throw("Not aligned to byte");
        }
        const value = this.buffer.readInt32LE(this.offset / 8);
        this.offset += 32;
        return value;
    }

    readUint32(): number {
        if (this.offset % 8) {
            throw("Not aligned to byte");
        }
        const value = this.buffer.readUInt32LE(this.offset / 8);
        this.offset += 32;
        return value;
    }

    readUint64(): bigint {
        // buffer.readBigUint64LE expects a single 8-byte little endian number.
        // Source encodes 8-byte numbers as a pair of 4-byte LE numbers,
        // where the first one is the larger one.
        // i.e.
        // 2 = [00] [00] [00] [00] [02] [00] [00] [00]
        // instead of
        // 2 = [02] [00] [00] [00] [00] [00] [00] [00]

        const val1 = this.readUint32();
        const val2 = this.readUint32();
        // Bit-shift to BigInt
        return (BigInt(val1) << BigInt(32)) + BigInt(val2);
    }

    readFloat32(): number {
        if (this.offset % 8) {
            throw("Not aligned to byte");
        }
        const value = this.buffer.readFloatLE(this.offset / 8);
        this.offset += 32;
        return value;
    }

    // http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt

    /* utf.js - UTF-8 <=> UTF-16 convertion
    *
    * Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
    * Version: 1.0
    * LastModified: Dec 25 1999
    * This library is free.  You can redistribute it and/or modify it.
    */

    static utf8ArrayToStr(array: number[]): string {
        var out, i, len, c;
        var char2, char3;

        out = "";
        len = array.length;
        i = 0;
        while (i < len) {
            c = array[i++];
            switch (c >> 4) {
                case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                    // 0xxxxxxx
                    out += String.fromCharCode(c);
                    break;
                case 12: case 13:
                    // 110x xxxx   10xx xxxx
                    char2 = array[i++];
                    out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                    break;
                case 14:
                    // 1110 xxxx  10xx xxxx  10xx xxxx
                    char2 = array[i++];
                    char3 = array[i++];
                    out += String.fromCharCode(((c & 0x0F) << 12) |
                        ((char2 & 0x3F) << 6) |
                        ((char3 & 0x3F) << 0));
                    break;
            }
        }

        return out;
    }

    // Read a null-terminated string
    readString(): string {
        let chars = new Array<number>();
        var char = null;
        while (char != 0) {
            if (this.offset >= this.buffer.byteLength * 8) {
                throw ("Failed to read null-terminator");
            }

            char = this.readUint8();
            if (char != 0) {
                chars.push(char);
            }
        }

        return BinaryReader.utf8ArrayToStr(chars);
    }
}