const functions = require('./../modules/Functions');
const fs = require('fs');
const Car = require('./../models/Car');


test('Cоздание json файла', async () => {

    const filename = 'testFile.json';
    const testData = {
        'key1': 'value1',
        'key2': 'value2'
    };

    functions.writeJson(filename, testData).then(() => {
        const hasCreated = fs.existsSync(filename);
        expect(hasCreated).toBe(true);

        // TODO: Implement readJson test!
        // const writtenData = functions.readJson(filename);
        // expect(writtenData).toBe(testData);

        if(fs.existsSync(filename)) {
            fs.unlinkSync(filename);
        }
    });
});


test('Создание xlsx файла', () => {
    const filepath = 'test.xlsx';
    const data = [
        {
            'Column1': 'value1',
            'Column2': 'value2'
        },
        {
            'Column1': 'value3',
            'Column2': 'value4'
        },
        {
            'Column1': 'value5',
            'Column3': 'value6'
        }];

    functions.createXLSXAsync(filepath, data, 'testSheet1').then(() => {
        const isCreated = fs.existsSync(filepath);
        expect(isCreated).toBe(true);
        fs.unlinkSync(filepath);
    });
});


test('Отправка GET запроса', async () => {
    const url = 'https://reqres.in/api/users?page=2';
    const response = await functions.get(url);

    expect(response.status).toBe(200);
});


test('Отправка POST запроса', async () => {
    const url = 'https://reqres.in/api/login';
    const response = await functions.post(url, {
        "email": "eve.holt@reqres.in",
        "password": "cityslicka"
    });

    expect(response.status).toBe(200);
    expect(response.data['token']).toBe('QpwL5tke4Pnpja7X4');
});


test('Отправка множественного GET запроса', async () => {
    const url = 'https://reqres.in/api/users?page=2';
    const response = await functions.tryGet(url);

    expect(response.status).toBe(200);
});


test('Отправка множественного POST запроса', async () => {
    const url = 'https://reqres.in/api/login';
    const response = await functions.tryPost(url, {
        "email": "eve.holt@reqres.in",
        "password": "cityslicka"
    });

    expect(response.status).toBe(200);
    expect(response.data['token']).toBe('QpwL5tke4Pnpja7X4');
});