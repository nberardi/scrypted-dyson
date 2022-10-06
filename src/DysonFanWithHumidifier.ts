import { HumidityCommand, HumidityMode, HumiditySetting } from '@scrypted/sdk';
import { DysonFanWithAdvancedAirQuality } from './DysonFanWithAdvancedAirQuality';

export class DysonFanWithHumidifier extends DysonFanWithAdvancedAirQuality implements HumiditySetting {
    constructor(nativeId: string) {
        super(nativeId);

        this.humiditySetting = {
            mode: HumidityMode.Off,
            availableModes: [HumidityMode.Auto, HumidityMode.Humidify, HumidityMode.Off]
        };
    }
    
    async setHumidity(humidity: HumidityCommand): Promise<void> {

        let commandData = {
        };

        if (humidity.mode) {
            commandData['hume'] = humidity.mode === HumidityMode.Off ? 'OFF' : 'HUMD';
        }

        if (humidity.humidifierSetpoint) {
            commandData['humt'] = humidity.humidifierSetpoint;
        }

        this.console.log(`setHumidity(${JSON.stringify(humidity)}): ${JSON.stringify(commandData)}`);
        this.setState(commandData);
    }

    processCurrentState(content: any) {
        super.processCurrentState(content);

        if (content['product-state']['hume']) {
            let mode = (content['product-state']['hume'] === 'OFF') ? HumidityMode.Off : HumidityMode.Humidify;
            this.humiditySetting.mode = mode;
        }
        if (content['product-state']['hume'] && content['product-state']['msta']) {
            let mode = (content['product-state']['hume'] === 'OFF') ? HumidityMode.Off : (content['product-state']['msta'] === 'OFF' ? HumidityMode.Auto : HumidityMode.Humidify);
            this.humiditySetting.mode = mode;
        }
        if (content['product-state']['haut']) {
            let mode = (!super.on || content['product-state']['haut'] === 'OFF') ? HumidityMode.Auto : HumidityMode.Humidify;
            this.humiditySetting.activeMode = mode;
        }
        if (content['product-state']['humt']) {
            let humidity = Number.parseInt(content['product-state']['humt']);
            this.humiditySetting.humidifierSetpoint = humidity;
        }
    }

    processStateChange(content: any): void {
        super.processStateChange(content);

        if (content['product-state']['hume']) {
            let mode = (content['product-state']['hume'][1] === 'OFF') ? HumidityMode.Off : HumidityMode.Humidify;
            this.humiditySetting.mode = mode;
        }
        if (content['product-state']['hume'] && content['product-state']['msta']) {
            let mode = (content['product-state']['hume'][1] === 'OFF') ? HumidityMode.Off : (content['product-state']['msta'][1] === 'OFF' ? HumidityMode.Auto : HumidityMode.Humidify);
            this.humiditySetting.mode = mode;
        }
        if (content['product-state']['haut']) {
            let mode = (!super.on || content['product-state']['haut'][1] === 'OFF') ? HumidityMode.Auto : HumidityMode.Humidify;
            this.humiditySetting.activeMode = mode;
        }
        if (content['product-state']['humt']) {
            let humidity = Number.parseInt(content['product-state']['humt'][1]);
            this.humiditySetting.humidifierSetpoint = humidity;
        }
    }
}
