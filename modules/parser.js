class Parser {
    Functions = require('./functions');
    Logger = require('./logger');

    settings;

    constructor(settings) {
        this.settings = settings;
        this.functions = new this.Functions();
        this.logger = new this.Logger();

    }

    async run() {
        const vinsFilePath = `${this.settings.INPUT.DIRNAME}/${this.settings.INPUT.VINS_FILE}`.replaceAll('//', '/');
        const detailsFilePath = `${this.settings.INPUT.DIRNAME}/${this.settings.INPUT.DETAILS_FILE}`.replaceAll('//', '/');
        const accountsFilePath = `${this.settings.INPUT.DIRNAME}/${this.settings.INPUT.ACCOUNTS}`.replaceAll('//', '/');

        const vins = this.getVins(vinsFilePath);
        const details = this.getDetails(detailsFilePath);

    }

    getVins(filepath) {
        this.createVinsInputFileIfNotExists(filepath);
        return this.functions.readXLSX(filepath);
    }

    getDetails(filepath) {
        this.createDetailsInputFileIfNotExists(filepath);
        return this.functions.readXLSX(filepath);
    }

    createVinsInputFileIfNotExists(filepath) {
        const headers = [
            {
                'VINS': ''
            }
        ];
        this.functions.createXLSX(filepath, headers);
    }

    createDetailsInputFileIfNotExists(filepath) {
        const headers = [
            {
                'CATEGORY': '',
                'DETAIL_NAME': '',
                'DETAIL_NUMBER': ''
            }
        ];
        this.functions.createXLSX(filepath, headers);
    }

}

module.exports = Parser;