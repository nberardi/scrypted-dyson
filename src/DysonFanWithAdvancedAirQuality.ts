import { AirQuality, AirQualitySensor, HumiditySensor, NOXSensor, PM10Sensor, PM25Sensor, TemperatureUnit, Thermometer, VOCSensor } from '@scrypted/sdk';
import { DysonFan } from './DysonFan';

export class DysonFanWithAdvancedAirQuality extends DysonFan implements PM25Sensor, PM10Sensor, NOXSensor, VOCSensor, AirQualitySensor {
    constructor(nativeId: string) {
        super(nativeId);
    }

    processEnvironmentalSensorData(content: any) {
        super.processEnvironmentalSensorData(content);

        // skip the below if the product doesn't have advanced air quality sensors
        if (!this.productInfo.hasAdvancedAirQualitySensors)
            return;

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
        }

        this.pm25Density = pm25;
        this.pm10Density = pm10;
        this.vocDensity = va10;
        this.noxDensity = noxl;
    }
}
