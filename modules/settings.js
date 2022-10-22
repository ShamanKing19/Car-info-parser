class Settings {
    fs = require('fs');
    ini = require('ini');

    FILENAME = 'settings.ini';


    /**
     * Читает файл с настройками
     *
     * @returns {Object}
     */
    get() {
        this.createFileIfNotExists();
        let file = this.fs.readFileSync(this.FILENAME, 'utf-8');
        return this.ini.parse(file);
    }


    /**
     * Создаёт файл с настройками
     */
    createFileIfNotExists() {
        if (!this.fs.existsSync(this.FILENAME)) {
            this.fs.writeFileSync(this.FILENAME, '');

            const defaultSettings = {
                STARTUP: {
                    START_FROM_VINS: "Y"
                },
                INPUT: {
                    DIRNAME: 'input',
                    VINS_FILE: 'vins.xlsx',
                    DETAILS_FILE: 'details.xlsx',
                    ACCOUNTS: 'accounts.xlsx'
                },
                OUTPUT: {
                    DIRNAME: 'output',
                    CREATE_VINS_FILE: 'Y',
                    VINS_RESULT_IN_ONE_FILE: 'N',
                    DETAILS_RESULT_IN_ONE_FILE: 'N',
                    COUNT_AVERAGE_PRICE: 'Y',
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

}

module.exports = new Settings();