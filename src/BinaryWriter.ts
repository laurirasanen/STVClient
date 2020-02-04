import { SeekOrigin, BinaryReader } from "./BinaryReader";

export class BinaryWriter {
    private buffer: Buffer;
    private offset: number;

    constructor(size?: number) {
        this.buffer = Buffer.alloc(size || 0);
        this.offset = 0;
    }

    seek(offset: number, origin: SeekOrigin): number {
        switch (origin) {
            case SeekOrigin.Begin:
                return this.offset = offset;
            case SeekOrigin.End:
                return this.offset = this.buffer.byteLength - offset;
            default:
                return this.offset = this.offset + offset;
        }
    }

    getOffset = (): number => {
        return this.offset;
    }

    getSize = (): number => {
        return this.buffer.byteLength;
    }

    copy = (target: Buffer) => {
        for (let i = 0; i < this.buffer.byteLength; i++) {
            target.writeUInt8(this.buffer.readUInt8(i), i);
        }
    }

    extend = (amount: number) => {
        if (amount < 1) return;

        var buf = Buffer.alloc(this.buffer.byteLength + amount);
        this.copy(buf);
        this.buffer = buf;
        this.offset = this.buffer.byteLength - amount;
    }

    writeBoolean = (value: boolean) => {
        this.writeUint8(value ? 1 : 0);
    }

    writeUint8 = (value: number) => {
        this.extend(this.offset - this.buffer.byteLength + 1);

        this.buffer.writeUInt8(value, this.offset);
        this.offset += 1;
    }

    writeInt32 = (value: number) => {
        this.extend(this.offset - this.buffer.byteLength + 4);

        this.buffer.writeInt32LE(value, this.offset);
        this.offset += 4;
        return value;
    }

    writeUint32 = (value: number) => {
        this.extend(this.offset - this.buffer.byteLength + 4);

        this.buffer.writeUInt32LE(value, this.offset);
        this.offset += 4;
        return value;
    }

    writeUint64 = (value: BigInt) => {
        // Source encodes 64-bit numbers as a pair of 32-bit numbers
        var buff = Buffer.alloc(8);
        buff.writeBigUInt64LE(value as bigint, 0);
        var val1 = buff.readUInt32LE(0);
        var val2 = buff.readUInt32LE(4);

        this.writeUint32(val2);
        this.writeUint32(val1);
    }

    writeFloat32 = (value: number) => {
        this.extend(this.offset - this.buffer.byteLength + 4);

        this.buffer.writeFloatLE(value, this.offset);
        this.offset += 4;
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

    // Write a null-terminated string
    writeString = (value: string) => {
        // extend once instead of every time we write uint
        this.extend(this.offset - this.buffer.byteLength + value.length + 1);

        for (let i = 0; i < value.length; i++) {
            var char = value.charCodeAt(i);
            if (char === NaN) {
                throw (`Illegal character '${value[i]}' at index ${i} of '${value}'`);
            }
            this.writeUint8(char);
        }

        this.writeUint8(0);
    }
}