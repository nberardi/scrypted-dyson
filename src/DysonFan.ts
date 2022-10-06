import { AirQuality, AirQualitySensor, Fan, FanMode, FanState, OnOff } from '@scrypted/sdk';
import { DysonBase } from './DysonBase';

export class DysonFan extends DysonBase implements Fan, AirQualitySensor, OnOff {
    speed: number;
    mode?: FanMode;
    active?: boolean;
    maxSpeed?: number;
    counterClockwise?: boolean;
    availableModes?: FanMode[];

    tiltStatus: boolean;
    errorCode: string;
    warningCode: string;

    constructor(nativeId: string) {
        super(nativeId);
    }

    getState() : any {
        let commandData = super.getState();

        commandData['rhtm'] = this.storageSettings.values.continuousMonitoring ? 'ON' : 'OFF';
        commandData['nmod'] = this.storageSettings.values.nightMode ? 'ON' : 'OFF';
        commandData['ffoc'] = this.storageSettings.values.focusMode ? 'ON' : 'OFF';
        commandData['fdir'] = this.storageSettings.values.backwardsAirflow ? 'OFF' : 'ON';

        return commandData;
    }

    turnOff(): Promise<void> {
        return this.turnOn(false);
    }
    async turnOn(on:boolean = true): Promise<void> {
        // Checks if the device is already in the target mode
        //if (this.on === on) {
        //    return;
        //}

        // Gets the active mode based on the configuration
        //let activeMode = this.config.enableAutoModeWhenActivating ? 'AUTO' : 'FAN';

        // Builds the command data, which contains the active state and (optionally) the oscillation and night modes
        let commandData = {
            fpwr: !on ? 'OFF' : 'ON',
            fmod: !on ? 'OFF' : 'ON'
        };

        //if (config.enableOscillationWhenActivating) {
        //    commandData['oson'] = 'ON';
        //}
        //if (config.enableNightModeWhenActivating) {
        //    commandData['nmod'] = 'ON';
        //}

        // The Dyson app disables heating when the device is turned on
        //if (value === Characteristic.Active.ACTIVE && device.info.hasHeating && !config.isHeatingSafetyIgnored) {
        //    commandData['hmod'] = 'OFF';
        //}

        // Executes the actual change of the active state
        this.console.log(`${on ? 'turnOn': 'turnOff'}: ${JSON.stringify(commandData)}`);
        this.setState(commandData);
    }
    
    async setFan(fan: FanState): Promise<void> {
        this.console.log("setFan");

        let commandData = {
        };

        if (fan.mode) {
            let fanMode = fan.mode === FanMode.Auto ? 'AUTO' : 'FAN';
            commandData['fmod'] = this.on ? 'OFF' : fanMode;
            commandData['auto'] = fan.mode === FanMode.Auto ? 'ON' : 'OFF';
        }

        if (fan.speed) {
            commandData['fnsp'] = ('0000' + Math.round(fan.speed / 10.0).toString()).slice(-4)
        }

        this.console.log(`setFan(${JSON.stringify(fan)}): ${JSON.stringify(commandData)}`);
        this.setState(commandData);
    }

    processCurrentState(content: any) {
        super.processCurrentState(content);

        // Sets the power state
        if (content['product-state']['fpwr']) {
            this.on = content['product-state']['fpwr'] !== 'OFF';
        }
        if (content['product-state']['fmod']) {
            this.on = content['product-state']['fmod'] !== 'OFF';
        }

        // Sets the operation mode
        if (content['product-state']['fpwr'] && content['product-state']['fnst'] && content['product-state']['auto']) {
            let fanState = content['product-state']['fnst'] === 'OFF' ? "IDLE" : "PURIFYING_AIR";
            let fanMode = content['product-state']['auto'] === 'OFF' ? FanMode.Manual : FanMode.Auto;

            this.fan.active = this.on;
            this.fan.mode = fanMode;
        }
        if (content['product-state']['fmod'] && content['product-state']['fnst']) {
            let fanState = content['product-state']['fnst'] === 'OFF' ? "IDLE" : "PURIFYING_AIR";
            let fanMode = content['product-state']['fmod'] === 'AUTO' ? FanMode.Auto : FanMode.Manual;

            this.fan.active = this.on;
            this.fan.mode = fanMode;
        }

        // Sets the rotation status
        let swingMode = content['product-state']['oson'] === 'OFF' ? "SWING_DISABLED" : "SWING_ENABLED";

        // Sets the fan speed based on the auto setting
        if (content['product-state']['fnsp'] !== 'AUTO' && content['product-state']['fnsp'] !== 'OFF') {
            let rotationSpeed = Number.parseInt(content['product-state']['fnsp']) * 10;

            this.fan.speed = rotationSpeed;
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

        /*
            // Sets the filter life
            if (content['product-state']['cflr'] && content['product-state']['hflr']) {
                const cflr = content['product-state']['cflr'] == "INV" ? 100 : Number.parseInt(content['product-state']['cflr']);
                const hflr = content['product-state']['hflr'] == "INV" ? 100 : Number.parseInt(content['product-state']['hflr']);
                airPurifierService.updateCharacteristic(Characteristic.FilterChangeIndication, Math.min(cflr, hflr) >= 10 ? Characteristic.FilterChangeIndication.FILTER_OK : Characteristic.FilterChangeIndication.CHANGE_FILTER);
                airPurifierService.updateCharacteristic(Characteristic.FilterLifeLevel, Math.min(cflr,hflr));
            }
            if (content['product-state']['filf']) {
    
                // Calculates the filter life, assuming 12 hours a day, 360 days
                const filterLife = Number.parseInt(content['product-state']['filf']) / (360 * 12);
                airPurifierService.updateCharacteristic(Characteristic.FilterChangeIndication, Math.ceil(filterLife * 100) >= 10 ? Characteristic.FilterChangeIndication.FILTER_OK : Characteristic.FilterChangeIndication.CHANGE_FILTER);
                airPurifierService.updateCharacteristic(Characteristic.FilterLifeLevel, Math.ceil(filterLife * 100));
            }
        */
    }

    processStateChange(content: any) {
        super.processStateChange(content);

        // Sets the power state
        if (content['product-state']['fpwr']) {
            this.on = content['product-state']['fpwr'][1] !== 'OFF';
        }
        if (content['product-state']['fmod']) {
            this.on = content['product-state']['fmod'][1] !== 'OFF';
        }

        // Sets the operation mode
        if (content['product-state']['fpwr'] && content['product-state']['fnst'] && content['product-state']['auto']) {
            let fanState = content['product-state']['fnst'][1] === 'OFF' ? "IDLE" : "PURIFYING_AIR";
            let fanMode = content['product-state']['auto'][1] === 'OFF' ? FanMode.Manual : FanMode.Auto;

            this.fan.active = this.on;
            this.fan.mode = fanMode;
        }
        if (content['product-state']['fmod'] && content['product-state']['fnst']) {
            let fanState = content['product-state']['fnst'][1] === 'OFF' ? "IDLE" : "PURIFYING_AIR";
            let fanMode = content['product-state']['fmod'][1] === 'AUTO' ? FanMode.Auto : FanMode.Manual;

            this.fan.active = this.on;
            this.fan.mode = fanMode;
        }

        // Sets the rotation status
        let swingMode = content['product-state']['oson'][1] === 'OFF' ? "SWING_DISABLED" : "SWING_ENABLED";

        // Sets the fan speed based on the auto setting
        if (content['product-state']['fnsp'][1] !== 'AUTO' && content['product-state']['fnsp'][1] !== 'OFF') {
            let rotationSpeed = Number.parseInt(content['product-state']['fnsp'][1]) * 10;

            this.fan.speed = rotationSpeed;
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

        //this.processCurrentState(content);
        /*
            // Sets the filter life
            if (content['product-state']['cflr'] && content['product-state']['hflr']) {
                const cflr = content['product-state']['cflr'][1] == "INV" ? 100 : Number.parseInt(content['product-state']['cflr'][1]);
                const hflr = content['product-state']['cflr'][1] == "INV" ? 100 : Number.parseInt(content['product-state']['cflr'][1]);
                airPurifierService.updateCharacteristic(Characteristic.FilterChangeIndication, Math.min(cflr, hflr) >= 10 ? Characteristic.FilterChangeIndication.FILTER_OK : Characteristic.FilterChangeIndication.CHANGE_FILTER);
                airPurifierService.updateCharacteristic(Characteristic.FilterLifeLevel, Math.min(cflr,hflr));
            }
            if (content['product-state']['filf']) {

                // Calculates the filter life, assuming 12 hours a day, 360 days
                const filterLife = Number.parseInt(content['product-state']['filf'][1]) / (360 * 12);
                airPurifierService.updateCharacteristic(Characteristic.FilterChangeIndication, Math.ceil(filterLife * 100) >= 10 ? Characteristic.FilterChangeIndication.FILTER_OK : Characteristic.FilterChangeIndication.CHANGE_FILTER);
                airPurifierService.updateCharacteristic(Characteristic.FilterLifeLevel, Math.ceil(filterLife * 100));
            }
*/
    }

    processEnvironmentalSensorData(content: any) {
        super.processEnvironmentalSensorData(content);

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

        this.airQuality = AirQuality.Unknown;
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
        }
    }
}
