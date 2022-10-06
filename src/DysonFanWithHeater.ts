import { TemperatureSetting, TemperatureUnit, ThermostatMode } from '@scrypted/sdk';
import { DysonFanWithAdvancedAirQuality } from './DysonFanWithAdvancedAirQuality';

export class DysonFanWithHeater extends DysonFanWithAdvancedAirQuality implements TemperatureSetting {
    constructor(nativeId: string) {
        super(nativeId);

        this.thermostatAvailableModes = [ThermostatMode.Heat, ThermostatMode.On, ThermostatMode.Auto, ThermostatMode.Off];
    }
    async setThermostatMode(mode: ThermostatMode): Promise<void> {
        let commandData = {
            hmod: mode === ThermostatMode.On || mode == ThermostatMode.Heat || mode == ThermostatMode.Auto ? 'HEAT' : 'OFF'
        };

        this.console.log(`setThermostatMode(${mode}): ${JSON.stringify(commandData)}`);
        this.setState(commandData);
    }
    async setThermostatSetpoint(degrees: number): Promise<void> {
        this.thermostatSetpoint = degrees;

        let commandData = {
            hmax: ('0000' + Math.round((degrees + 273.0) * 10.0).toString()).slice(-4)
        }

        this.console.log(`setThermostatSetpoint(${degrees}): ${JSON.stringify(commandData)}`);
        this.setState(commandData);
    }

    async setThermostatSetpointHigh(high: number): Promise<void> {
        this.thermostatSetpointHigh = high

        let commandData = {
            hmax: ('0000' + Math.round((high + 273.0) * 10.0).toString()).slice(-4)
        }

        this.console.log(`setThermostatSetpointHigh(${high}): ${JSON.stringify(commandData)}`);
        this.setState(commandData);
    }

    async setThermostatSetpointLow(low: number): Promise<void> {
        this.thermostatSetpointLow = low;

        this.console.log(`setThermostatSetpointLow(${low})`);
    }

    processCurrentState(content: any) {
        super.processCurrentState(content);

        // Sets the heating mode and target temperature
        if (content['product-state']['hmod']) {
            let mode = (!super.on || content['product-state']['hmod'] === 'OFF') ? ThermostatMode.Off : ThermostatMode.Heat;
            this.thermostatActiveMode = mode;
            this.thermostatMode = mode;
        }
        if (content['product-state']['hmax']) {
            let targetTemp = super.convertKelvin(Number.parseInt(content['product-state']['hmax']) / 10.0, TemperatureUnit.C);

            this.thermostatSetpoint = targetTemp;
        }
    }

    processStateChange(content: any): void {
        super.processStateChange(content);

        // Sets the heating mode and target temperature
        if (content['product-state']['hmod']) {
            let mode = (!super.on || content['product-state']['hmod'][1] === 'OFF') ? ThermostatMode.Off : ThermostatMode.Heat;
            this.thermostatActiveMode = mode;
            this.thermostatMode = mode;
        }
        if (content['product-state']['hmax']) {
            let targetTemp = super.convertKelvin(Number.parseInt(content['product-state']['hmax'][1]) / 10.0, TemperatureUnit.C);

            this.thermostatSetpoint = targetTemp;
        }
    }
}
