class Logger {
    fs = require('fs');

    log(message) {
        console.log(message);
    }

    error(message) {
        console.error(message);
    }

    async json(filename, data) {
        const dirPath = __dirname + '/../logs';

        if (!this.fs.existsSync(dirPath)) {
            this.fs.mkdir(dirPath, () => {
                console.log('Directory "json" created!');
            });
        }

        this.fs.writeFile(`${dirPath}/${filename}.json`, JSON.stringify(data), 'utf-8', () => {});
    }

    logHtml(filename, data) {
        const dirPath = "../html";

        if (!this.fs.existsSync(dirPath)) {
            this.fs.mkdir(dirPath, () => {
                console.log("Directory 'html' created!");
            });
        }

        this.fs.writeFileSync(`${dirPath}/${filename}.html`, data);
    }
}

module.exports = Logger;