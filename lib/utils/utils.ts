export const isBetweenNumbers = (value: number, min: number, max: number): boolean => {
    return value >= min && value <= max;
}

//Create a function that lists numbers which are common in at least two arrays 
//(the function should take a list arrays as arguments)
// Language: typescript
// Path: lib\utils\utils.ts
export const commonNumbersInArrays = (...arrays: number[][]): number[] => {
    const result: number[] = [];
    arrays.forEach((array) => {
        array.forEach((number) => {
            if (!result.includes(number)) {
                result.push(number);
            }
        })
    })

    return result.filter((number) => {
        return arrays.every((array) => {
            return array.includes(number);
        })
    })
}