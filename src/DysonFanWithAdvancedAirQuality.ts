import { AirQuality, HumiditySensor, NOXSensor, PM10Sensor, PM25Sensor, TemperatureUnit, Thermometer, VOCSensor } from '@scrypted/sdk';
import { DysonFan } from './DysonFan';

export class DysonFanWithAdvancedAirQuality extends DysonFan implements HumiditySensor, Thermometer, PM25Sensor, PM10Sensor, NOXSensor, VOCSensor {
    constructor(nativeId: string) {
        super(nativeId);
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
        if (!temperatureUnit)
            temperatureUnit = this.temperatureUnit;

        if (temperatureUnit == TemperatureUnit.F) {
            return k - 459.67;
        }

        if (temperatureUnit == TemperatureUnit.C) {
            return k - 273.15;
        }
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
        let pm25 = 0;
        let pm10 = 0;
        let va10 = 0;
        let noxl = 0;
        let hcho = 0;

        // Checks whether continuous monitoring is disabled
        if (content['data']['p25r'] === 'OFF') {
            return;
        }
        if (content['data']['p10r'] === 'OFF') {
            return;
        }
        if (content['data']['va10'] === 'OFF') {
            return;
        }
        if (content['data']['noxl'] === 'OFF') {
            return;
        }

        pm25 = content['data']['p25r'] === 'INIT' ? 0 : Number.parseInt(content['data']['p25r']);
        pm10 = content['data']['p10r'] === 'INIT' ? 0 : Number.parseInt(content['data']['p10r']);
        va10 = content['data']['va10'] === 'INIT' ? 0 : Number.parseInt(content['data']['va10']);
        noxl = content['data']['noxl'] === 'INIT' ? 0 : Number.parseInt(content['data']['noxl']);

        if (content['data']['hchr']) {
            hcho = content['data']['hchr'] === 'INIT' ? 0 : Number.parseInt(content['data']['hchr']);
        }

        if (isNaN(pm25)) {
            pm25 = 0;
        }
        if (isNaN(pm10)) {
            pm10 = 0;
        }
        if (isNaN(va10)) {
            va10 = 0;
        }
        if (isNaN(noxl)) {
            noxl = 0;
        }
        if (isNaN(hcho)) {
            hcho = 0;
        }

        // Maps the values of the sensors to the relative values described in the app (1 - 5 => Good, Medium, Bad, Very Bad, Extremely Bad)
        const pm25Quality = pm25 <= 35 ? 1 : (pm25 <= 53 ? 2 : (pm25 <= 70 ? 3 : (pm25 <= 150 ? 4 : 5)));
        const pm10Quality = pm10 <= 50 ? 1 : (pm10 <= 75 ? 2 : (pm10 <= 100 ? 3 : (pm10 <= 350 ? 4 : 5)));

        // Maps the VOC values to a self-created scale (as described values in the app don't fit)
        const va10Quality = (va10 * 0.125) <= 3 ? 1 : ((va10 * 0.125) <= 6 ? 2 : ((va10 * 0.125) <= 8 ? 3 : 4));

        // Maps the NO2 value to a self-created scale
        const noxlQuality = noxl <= 30 ? 1 : (noxl <= 60 ? 2 : (noxl <= 80 ? 3 : (noxl <= 90 ? 4 : 5)));

        // Maps the HCHO value to a self-created scale
        const hchoQuality = hcho <= 99 ? 1 : (hcho <= 299 ? 2 : (hcho <= 499 ? 3 : 4));

        // Sets the sensor data for air quality (the poorest sensor result wins)
        var airQuality = Math.max(pm25Quality, pm10Quality, va10Quality, noxlQuality, hchoQuality);

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

        this.pm25Density = pm25;
        this.pm10Density = pm10;
        this.vocDensity = va10;
        this.noxDensity = noxl;
    }
}
