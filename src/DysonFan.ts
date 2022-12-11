import { AirQuality, AirQualitySensor, Fan, FanMode, FanState, FanStatus, HumiditySensor, OnOff, TemperatureUnit, Thermometer } from '@scrypted/sdk';
import { DysonBase } from './DysonBase';

export class DysonFan extends DysonBase implements Fan, AirQualitySensor, OnOff, HumiditySensor, Thermometer {
    tiltStatus: boolean;
    errorCode: string;
    warningCode: string;
    filterChangeRequired: boolean;
    filterLifeLevel: number;

    constructor(nativeId: string) {
        super(nativeId);

        this.fan = {
            speed: 0,
            maxSpeed: 100,
            swing: false,
            active: false,
            availableModes: [FanMode.Auto, FanMode.Manual],
            mode: FanMode.Manual
        };
    }

    getState() : any {
        let commandData = super.getState();

        if (this.capabilities.includes("auto"))
            commandData['auto'] = this.storageSettings.values.autoMode ? 'ON' : 'OFF';

        if (this.capabilities.includes("fmod"))
            commandData['fmod'] = this.storageSettings.values.autoMode ? 'AUTO' : 'FAN';

        if (this.capabilities.includes("rhtm"))
            commandData['rhtm'] = this.storageSettings.values.continuousMonitoring ? 'ON' : 'OFF';

        if (this.capabilities.includes("nmod"))
            commandData['nmod'] = this.storageSettings.values.nightMode ? 'ON' : 'OFF';

        if (this.capabilities.includes("oson"))
            commandData['oson'] = this.storageSettings.values.swingMode ? 'ON' : 'OFF';

        if (this.capabilities.includes("osal") && this.storageSettings.values.swingMode && this.storageSettings.values.swingModeCenter !== 0) {
            const centerPoint = (this.storageSettings.values.swingModeCenter ?? 0) + 180;
            const degrees = Number.parseFloat(this.storageSettings.values.swingModeDegrees) / 2.0;

            let lowerBound = Math.min(Math.max(centerPoint - degrees, 5.0), 355.0);
            let upperBound = Math.min(Math.max(centerPoint + degrees, 5.0), 355.0);

            commandData['osal'] = ('0000' + Math.min(lowerBound, upperBound).toString()).slice(-4);
            commandData['osau'] = ('0000' + Math.max(lowerBound, upperBound).toString()).slice(-4);
        }

        if (this.capabilities.includes("ancp") && this.storageSettings.values.swingMode) {
            if (this.storageSettings.values.swingModeCenter === 0)
                commandData['ancp'] = ('0000' + this.storageSettings.values.swingModeDegrees).slice(-4);
            else
                commandData['ancp'] = 'CUST';
        }

        if (this.capabilities.includes("ffoc"))
            commandData['ffoc'] = this.storageSettings.values.focusMode ? 'ON' : 'OFF';

        if (this.capabilities.includes("fdir"))
            commandData['fdir'] = this.storageSettings.values.backwardsAirflow ? 'OFF' : 'ON';

        return commandData;
    }

    turnOff(): Promise<void> {
        return this.turnOn(false);
    }

    async setTemperatureUnit(temperatureUnit: TemperatureUnit): Promise<void> {
        this.storageSettings.values.temperatureUnit = temperatureUnit;
        this.temperatureUnit = temperatureUnit;
    }

    updateSettings() {
        super.updateSettings();

        this.temperatureUnit = this.storageSettings.values.temperatureUnit;
    }

    convertKelvin(k: number, temperatureUnit?: TemperatureUnit): number {
        if (!this.temperatureUnit)
            this.temperatureUnit = TemperatureUnit.C;

        if (!temperatureUnit)
            temperatureUnit = this.temperatureUnit;

        let c = k - 273.15;

        if (temperatureUnit === TemperatureUnit.C)
            return c;

        let f = c * (9/5) + 32;

        if (temperatureUnit === TemperatureUnit.F)
            return f;
    }

    async turnOn(on:boolean = true): Promise<void> {
        this.on = on;

        let commandData = {
        };

        // restore state when turned on
        if (on)
            commandData = this.getState();

        if (this.capabilities.includes("fmod")) {
            let fanMode = this.fan.mode === FanMode.Auto ? 'AUTO' : 'FAN';
            commandData['fmod'] = on ? fanMode : 'OFF';
        }

        if (this.capabilities.includes("fpwr")) {
            commandData['fpwr'] = on ? 'ON' : 'OFF';
        }

        // Executes the actual change of the active state
        this.console.log(`${on ? 'turnOn': 'turnOff'}(): ${JSON.stringify(commandData)}`);
        this.setState(commandData);
    }
    
    async setFan(fan: FanState): Promise<void> {
        let commandData = {
        };

        // if the fan is off and fan speed is set to 0 ignore
        // this is a combination of two events that occur from HomeKit bindings that should be ignored
        if (!this.on && fan.speed === 0)
            return;

        if (fan.mode !== undefined) {
            if (this.capabilities.includes("fmod")) {
                let fanMode = fan.mode === FanMode.Auto ? 'AUTO' : 'FAN';
                commandData['fmod'] = fanMode;
            }
    
            if (this.capabilities.includes("fpwr")) {
                commandData['auto'] = fan.mode === FanMode.Auto ? 'ON' : 'OFF';
            }
        }

        if (fan.speed !== undefined) {
            commandData['fnsp'] = ('0000' + Math.round(fan.speed / 10.0).toString()).slice(-4)
        }

        if (fan.swing !== undefined) {
            commandData['oson'] = fan.swing ? 'ON' : 'OFF';
        }

        this.console.log(`setFan(${JSON.stringify(fan)}): ${JSON.stringify(commandData)}`);
        this.setState(commandData);
    }

    processCurrentState(content: any) {
        super.processCurrentState(content);

        let fan: FanStatus = JSON.parse(JSON.stringify(this.fan));

        // Sets the power state
        if (content['product-state']['fpwr']) {
            this.on = content['product-state']['fpwr'] !== 'OFF';
        }
        if (content['product-state']['fmod']) {
            this.on = content['product-state']['fmod'] !== 'OFF';
        }

        // Sets the operation mode
        if (content['product-state']['fpwr'] && content['product-state']['fnst'] && content['product-state']['auto']) {
            let fanState = content['product-state']['fnst'] !== 'OFF';
            let fanMode = content['product-state']['auto'] === 'OFF' ? FanMode.Manual : FanMode.Auto;

            fan.active = fanState;
            fan.mode = fanMode;
        }
        if (content['product-state']['fmod'] && content['product-state']['fnst']) {
            let fanState = content['product-state']['fnst'] !== 'OFF';
            let fanMode = content['product-state']['fmod'] === 'AUTO' ? FanMode.Auto : FanMode.Manual;

            fan.active = fanState;
            fan.mode = fanMode;
        }

        // Sets the rotation status
        this.storageSettings.values.swingMode = content['product-state']['oson'] !== 'OFF'
        fan.swing = this.storageSettings.values.swingMode;

        if (content['product-state']['ancp']) {
            let degrees = Number.parseInt(content['product-state']['ancp']);
            if (Number.isInteger(degrees))
                this.storageSettings.values.swingModeDegrees = degrees;
        }

        if (content['product-state']['osal']) {
            const lowerBoundSwing = Number.parseInt(content['product-state']['osal']);
            const upperBoundSwing = Number.parseInt(content['product-state']['osau']);

            const diff = upperBoundSwing - lowerBoundSwing;
            const centerPoint = upperBoundSwing - (diff / 2.0) - 180;
            this.storageSettings.values.swingModeCenter = centerPoint.toFixed(0);

            if (diff === 45 || diff === 90 || diff === 180 || diff === 350)
                this.storageSettings.values.swingModeDegrees = diff;
        }

        // Sets the fan speed based on the auto setting
        if (content['product-state']['fnsp'] !== 'AUTO' && content['product-state']['fnsp'] !== 'OFF') {
            let rotationSpeed = Number.parseInt(content['product-state']['fnsp']) * 10;

            fan.speed = rotationSpeed;
            fan.active = true;
            fan.mode = FanMode.Manual;
        }

        // Sets the state of the continuous monitoring switch
        this.storageSettings.values.continuousMonitoring = content['product-state']['rhtm'] !== 'OFF';
        // Sets the state of the night mode switch
        this.storageSettings.values.nightMode = content['product-state']['nmod'] !== 'OFF';
        // Sets the fan focus mode
        if (content['product-state']['ffoc'])
            this.storageSettings.values.focusMode = content['product-state']['ffoc'] !== 'OFF';
        // Sets the tilt status
        if (content['product-state']['tilt'])
            this.tiltStatus = content['product-state']['tilt'][1] === "TILT";
        // Sets the error code if any
        this.errorCode = content['product-state']['ercd'];
        // Sets the warning code if any
        this.warningCode = content['product-state']['wacd'];

        // Sets the direction of the fan
        if (content['product-state']['fdir']) {
            this.storageSettings.values.backwardsAirflow =  content['product-state']['fdir'] === 'OFF';
        }

        if (content['product-state']['cflr'] && content['product-state']['hflr']) {
            const cflr = content['product-state']['cflr'] == "INV" ? 100 : Number.parseInt(content['product-state']['cflr']);
            const hflr = content['product-state']['hflr'] == "INV" ? 100 : Number.parseInt(content['product-state']['hflr']);

            this.filterChangeRequired = Math.min(cflr, hflr) < 10;
            this.filterLifeLevel = Math.min(cflr, hflr);
        }

        if (content['product-state']['filf']) {
            const filf = Number.parseInt(content['product-state']['filf']);

            this.filterChangeRequired = Math.ceil(filf * 100) < 10;
            this.filterLifeLevel = Math.ceil(filf * 100);
        }

        this.storageSettings.values.autoMode = fan.mode === FanMode.Auto;
        this.fan = fan;
    }

    processStateChange(content: any) {
        super.processStateChange(content);

        let fan: FanStatus = JSON.parse(JSON.stringify(this.fan));

        // Sets the power state
        if (content['product-state']['fpwr']) {
            this.on = content['product-state']['fpwr'][1] !== 'OFF';
        }
        if (content['product-state']['fmod']) {
            this.on = content['product-state']['fmod'][1] !== 'OFF';
        }

        // Sets the operation mode
        if (content['product-state']['fpwr'] && content['product-state']['fnst'] && content['product-state']['auto']) {
            let fanState = content['product-state']['fnst'][1] !== 'OFF';
            let fanMode = content['product-state']['auto'][1] === 'OFF' ? FanMode.Manual : FanMode.Auto;

            fan.active = fanState;
            fan.mode = fanMode;
        }
        if (content['product-state']['fmod'] && content['product-state']['fnst']) {
            let fanState = content['product-state']['fnst'][1] !== 'OFF';
            let fanMode = content['product-state']['fmod'][1] === 'AUTO' ? FanMode.Auto : FanMode.Manual;

            fan.active = fanState;
            fan.mode = fanMode;
        }

        // Sets the rotation status
        this.storageSettings.values.swingMode = content['product-state']['oson'][1] !== 'OFF'
        fan.swing = this.storageSettings.values.swingMode;

        if (content['product-state']['ancp']) {
            let degrees = Number.parseInt(content['product-state']['ancp'][1]);
            if (Number.isInteger(degrees))
                this.storageSettings.values.swingModeDegrees = degrees;
        }

        if (content['product-state']['osal']) {
            const lowerBoundSwing = Number.parseInt(content['product-state']['osal'][1]);
            const upperBoundSwing = Number.parseInt(content['product-state']['osau'][1]);

            const diff = upperBoundSwing - lowerBoundSwing;
            const centerPoint = upperBoundSwing - (diff / 2.0) - 180;
            this.storageSettings.values.swingModeCenter = centerPoint.toFixed(0);

            if (diff === 45 || diff === 90 || diff === 180 || diff === 350)
                this.storageSettings.values.swingModeDegrees = diff;
        }

        // Sets the fan speed based on the auto setting
        if (content['product-state']['fnsp'][1] !== 'AUTO' && content['product-state']['fnsp'][1] !== 'OFF') {
            let rotationSpeed = Number.parseInt(content['product-state']['fnsp'][1]) * 10;

            fan.speed = rotationSpeed;
            fan.active = true;
            fan.mode = FanMode.Manual;
        }

        // Sets the state of the continuous monitoring switch
        this.storageSettings.values.continuousMonitoring = content['product-state']['rhtm'][1] !== 'OFF';
        // Sets the state of the night mode switch
        this.storageSettings.values.nightMode = content['product-state']['nmod'][1] !== 'OFF';
        // Sets the fan focus mode
        if (content['product-state']['ffoc'])
            this.storageSettings.values.focusMode = content['product-state']['ffoc'][1] !== 'OFF';
        // Sets the tilt status
        if (content['product-state']['tilt'])
            this.tiltStatus = content['product-state']['tilt'][1] === "TILT";
        // Sets the error code if any
        this.errorCode = content['product-state']['ercd'][1];
        // Sets the warning code if any
        this.warningCode = content['product-state']['wacd'][1];

        // Sets the direction of the fan
        if (content['product-state']['fdir']) {
            this.storageSettings.values.backwardsAirflow =  content['product-state']['fdir'][1] === 'OFF';
        }

        if (content['product-state']['cflr'] && content['product-state']['hflr']) {
            const cflr = content['product-state']['cflr'][1] == "INV" ? 100 : Number.parseInt(content['product-state']['cflr'][1]);
            const hflr = content['product-state']['hflr'][1] == "INV" ? 100 : Number.parseInt(content['product-state']['hflr'][1]);

            this.filterChangeRequired = Math.min(cflr, hflr) >= 10;
            this.filterLifeLevel = Math.min(cflr, hflr);
        }

        if (content['product-state']['filf']) {
            const filf = Number.parseInt(content['product-state']['filf'][1]);

            this.filterChangeRequired = Math.ceil(filf * 100) >= 10;
            this.filterLifeLevel = Math.ceil(filf * 100);
        }

        this.storageSettings.values.autoMode = fan.mode === FanMode.Auto;
        this.fan = fan;
    }

    processEnvironmentalSensorData(content: any) {
        super.processEnvironmentalSensorData(content);

        // Sets the sensor data for temperature
        if (content['data']['tact'] !== 'OFF') {
            this.temperature = this.convertKelvin(Number.parseInt(content['data']['tact']) / 10.0, TemperatureUnit.C);
        }

        // Sets the sensor data for humidity
        if (content['data']['hact'] !== 'OFF') {
            this.humidity = Number.parseInt(content['data']['hact']);
        }

        // Parses the air quality sensor data
        let p = 0;
        let v = 0;

        // Checks whether continuous monitoring is disabled
        if (content['data']['pact'] === 'OFF') {
            return;
        }
        if (content['data']['vact'] === 'OFF') {
            return;
        }

        p = content['data']['pact'] === 'INIT' ? 0 : Number.parseInt(content['data']['pact']);
        v = content['data']['vact'] === 'INIT' ? 0 : Number.parseInt(content['data']['vact']);

        if (isNaN(p)) {
            p = 0;
        }
        if (isNaN(v)) {
            v = 0;
        }

        // Maps the values of the sensors to the relative values, these operations are copied from the newer devices as the app does not specify the correct values
        const pQuality = p <= 2 ? 1 : (p <= 4 ? 2 : (p <= 7 ? 3 : (p <= 9 ? 4 : 5)));
        const vQuality = (v * 0.125) <= 3 ? 1 : ((v * 0.125) <= 6 ? 2 : ((v * 0.125) <= 8 ? 3 : 4));

        // Sets the sensor data for air quality (the poorest sensor result wins)
        var airQuality = Math.max(pQuality, vQuality);

        switch(airQuality) {
            case 1: 
                this.airQuality = AirQuality.Excellent;
                break;
            case 2:
                this.airQuality = AirQuality.Good;
                break;
            case 3:
                this.airQuality = AirQuality.Fair;
                break;
            case 4:
                this.airQuality = AirQuality.Poor;
                break;
            case 5:
                this.airQuality = AirQuality.Inferior;
                break;
            default:
                this.airQuality = AirQuality.Unknown;
                break;
        }
    }
}
