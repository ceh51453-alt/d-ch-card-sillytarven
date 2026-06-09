const test = (before, after) => {
    const isObjectKey = /(?:[{,]\s*|\n\s*|^['"\s]*)['"]?$/.test(before) && /^['"]?\s*:/.test(after) && !/^['"]?\s*:\/\//.test(after);
    console.log(`"${before}" | "${after}" -> ${isObjectKey}`);
}

test(", '", "':"); // comma and quote
test(", ", ":"); // comma no quote
test("{\n    '", "':"); // Object literal start 
test("<strong>", ":</strong>"); // HTML
