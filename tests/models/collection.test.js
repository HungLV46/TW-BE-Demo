const { Collection } = require('@models');

describe('Test collection model', () => {
  it('Test generate slug', () => {
    // setup 1
    const collection = new Collection();
    collection.id = 1;
    collection.name = 'àáạảãâầấậẩẫăằắặẳẵèéẹ';
    // execute
    let result = collection.generateSlug();
    // verify
    expect(result).toBe('aaaaaaaaaaaaaaaaaeee-1');

    // setup 2
    collection.name = 'ẻẽêềếệểễìíịỉĩòóọỏõôồ';
    // execute
    result = collection.generateSlug();
    // verify
    expect(result).toBe('eeeeeeeeiiiiiooooooo-1');

    // setup 3
    collection.name = 'ốộổỗơờớợởỡùúụủũưừứựử';
    // execute
    result = collection.generateSlug();
    // verify
    expect(result).toBe('oooooooooouuuuuuuuuu-1');

    // setup 4
    collection.name = 'ữỳýỵỷỹ\u0300\u0301\u0303\u0309\u0323\u02C6\u0306\u031B';
    // execute
    result = collection.generateSlug();
    // verify
    expect(result).toBe('uyyyyy-1');

    // setup 5
    collection.name = 'Áo Dài Việt Nam';
    // execute
    result = collection.generateSlug();
    // verify
    expect(result).toBe('ao-dai-viet-nam-1');
  });
});
