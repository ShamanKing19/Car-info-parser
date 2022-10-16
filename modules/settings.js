class Settings {
    fs = require('fs');
    ini = require('ini');

    FILENAME = 'settings.ini';


    get() {
        this.createFileIfNotExists();
        let file = this.fs.readFileSync(this.FILENAME, 'utf-8');
        return this.ini.parse(file);
    }


    createFileIfNotExists() {
        if (!this.fs.existsSync(this.FILENAME)) {
            this.fs.writeFileSync(this.FILENAME, '');

            let file = this.fs.readFileSync(this.FILENAME, 'utf-8');

            const defaultSettings = {
                INPUT: {
                    DIRNAME: 'input',
                    VINS_FILE: 'vins.xlsx',
                    DETAILS_FILE: 'details.xlsx',
                    ACCOUNTS: 'accounts.xlsx'
                },
                OUTPUT: {
                    DIRNAME: 'output',
                    COUNT_AVERAGE_PRICE: 'Y',
                    VINS_RESULT_IN_ONE_FILE: 'Y',
                    DETAILS_RESULT_IN_ONE_FILE: 'N',
                },
                SETTINGS: {
                    DELIVERY_LIMIT: 30,
                    REPEAT_DETAIL_CYCLES: 3,
                },
                PARSERS: {
                    AUTODOC: 'Y',
                    EMEX: 'Y'
                },
                DEBUG: {
                    LOGS: 'Y',
                    ERRORS: 'Y'
                }
            };

            this.fs.writeFileSync(this.FILENAME, this.ini.stringify(defaultSettings));


        }
    }


    getDefaultSettings() {

    }

}

module.exports = Settings;