class Logger {
    fs = require('fs');
    logsDir = process.cwd() + '/logs';
    logsPath = `${this.logsDir}/log.txt`;
    errorsPath = `${this.logsDir}/error.txt`;

    async log(message) {
        if (!this.fs.existsSync(this.logsDir)) {
            await this.fs.mkdir(this.logsDir, () => {});
        }

        const now = new Date().toLocaleString();
        const formattedMessage = now + ': ' + message + '\n';
        await this.fs.appendFile(this.logsPath, formattedMessage, () => {
            // console.log(message);
        });
    }

    async error(message, debug = false) {
        if (debug) {
            console.log(message);
        }

        if (!this.fs.existsSync(this.logsDir)) {
            await this.fs.mkdir(this.logsDir, () => {});
        }
        const now = new Date().toLocaleString();
        const formattedMessage = now + ': ' + message + '\n';
        await this.fs.appendFile(this.errorsPath, formattedMessage, () => {
            // console.log(message);
        });
    }

    async json(filename, data) {
        const dirPath = './../logs';

        if (!this.fs.existsSync(dirPath)) {
            this.fs.mkdir(dirPath, () => {
                console.log('Directory "json" created!');
            });
        }

        await this.fs.writeFile(`${dirPath}/${filename}.json`, JSON.stringify(data), 'utf-8', () => {});
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

module.exports = new Logger();