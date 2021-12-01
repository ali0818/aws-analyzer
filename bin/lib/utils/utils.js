"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commonNumbersInArrays = exports.isBetweenNumbers = void 0;
const isBetweenNumbers = (value, min, max) => {
    return value >= min && value <= max;
};
exports.isBetweenNumbers = isBetweenNumbers;
//Create a function that lists numbers which are common in at least two arrays 
//(the function should take a list arrays as arguments)
// Language: typescript
// Path: lib\utils\utils.ts
const commonNumbersInArrays = (...arrays) => {
    const result = [];
    arrays.forEach((array) => {
        array.forEach((number) => {
            if (!result.includes(number)) {
                result.push(number);
            }
        });
    });
    return result.filter((number) => {
        return arrays.every((array) => {
            return array.includes(number);
        });
    });
};
exports.commonNumbersInArrays = commonNumbersInArrays;
//# sourceMappingURL=utils.js.map