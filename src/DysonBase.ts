import { FanMode, FanState, FanStatus, Online, Refresh, ScryptedDeviceBase, ScryptedInterface, Setting, Settings, SettingValue } from '@scrypted/sdk';
import { StorageSetting, StorageSettings, StorageSettingsDevice } from '@scrypted/sdk/storage-settings';
import { ProductInfo } from "./ProductInfo";
import mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { isNullOrUndefined } from 'util';
import { setEngine } from 'crypto';


export class DysonBase extends ScryptedDeviceBase implements Online, Settings, Refresh, StorageSettingsDevice {
    storageSettings = new StorageSettings(this, {
        ipAddress: {
            title: "IP Address",
            group: 'Credentials',
            type: "string",
            placeholder: "192.168.1.XX",
            description: "The IP Address of the fan on your local network.",
            onPut: () => this.connect()
        },
        serialNumber: {
            title: "Serial Number",
            group: 'Credentials',
            type: "string",
            description: "The Serial Number of the Dyson fan.",
            readonly: true
        },
        localPassword: {
            title: "Credentials",
            group: 'Credentials',
            type: "string",
            description: "Local credentials for accessing the device.",
            readonly: true
        },
        productType: {
            title: "Product Type",
            type: "string",
            description: "The numberical product type provided by Dyson.",
            readonly: true,
            hide: true
        },
        temperatureUnit: {
            title: 'Temperature Unit',
            choices: ['C', 'F'],
            defaultValue: 'C',
            onPut: () => this.updateSettings(),
        },
        autoMode: {
            title: 'Auto',
            description: 'The switch that controls auto mode.',
            type: 'boolean',
            onPut: () => this.updateSettings(),
        },
        continuousMonitoring: {
            title: 'Continuous Monitoring',
            description: 'The switch that controls continous monitoring.',
            type: 'boolean',
            onPut: () => this.updateSettings(),
        },
        nightMode: {
            title: 'Night Mode',
            description: 'The switch that controls night mode.',
            type: 'boolean',
            onPut: () => this.updateSettings(),
        },
        focusMode: {
            title: 'Focus Airflow',
            description: 'The switch that controls focus of the airflow, this is labeled as \'Difuse\' in the app.',
            type: 'boolean',
            onPut: () => this.updateSettings(),
        },
        swingMode: {
            title: 'Oscillation',
            description: 'The switch that controls oscillation of the fan moving back and forth.',
            type: 'boolean',
            onPut: () => this.updateSettings()
        },
        swingModeCenter: {
            title: 'Oscillation Center',
            description: 'The oscillation center point of the fan moving back and forth.',
            type: 'number',
            range: [-130, 130],
            placeholder: "0",
            onPut: () => this.updateSettings()
        },
        swingModeDegrees: {
            title: 'Oscillation Degrees',
            description: 'The oscillation degrees of the fan moving back and forth.',
            type: 'string',
            choices: ['45', '90', '180', '350'],
            onPut: () => this.updateSettings()

        },
        backwardsAirflow: {
            title: 'Backwards Airflow',
            description: 'The switch that controls the airflow direction.',
            type: 'boolean',
            onPut: () => this.updateSettings(),
        }
    });

    mqttClient: MqttClient;
    baseMqttPath: string;
    refreshMqttConnection: boolean;
    productInfo: any;
    processingState: boolean;
    capabilities: string[];

    constructor(nativeId: string) {
        super(nativeId);

        this.baseMqttPath = `${this.storageSettings.values.productType}/${this.storageSettings.values.serialNumber}`;
        this.refreshMqttConnection = false;
        this.productInfo = ProductInfo.get(this.storageSettings.values.productType);

        this.fan = {
            speed: 0,
            availableModes: [FanMode.Auto, FanMode.Manual],
            maxSpeed: 100
        };

        this.connect();
    }

    connect() {
        let self = this;

        if (this.mqttClient)
            return;

        const ipAddress: string = (this.storageSettings.values.ipAddress ?? "").trim();

        if (ipAddress.length === 0)
            return;

        this.console.log(`connecting to : mqtt://${ipAddress}`)

        // Initializes the MQTT client for local communication with the device
        this.mqttClient = mqtt.connect('mqtt://' + ipAddress, {
            username: this.storageSettings.values.serialNumber,
            password: this.storageSettings.values.localPassword,
            protocolVersion: 3,
            protocolId: 'MQIsdp'
        });

        this.mqttClient.on('connect', (packet) => {
            self.console.info("MQTT connection established.");

            // Subscribes to the status topic to receive updates
            self.mqttClient.subscribe(self.baseMqttPath + '/status/current', (error, granted) => {

                // Sends an initial request for the current state
                self.mqttClient.publish(self.baseMqttPath + '/command', JSON.stringify({
                    msg: 'REQUEST-CURRENT-STATE',
                    time: new Date().toISOString()
                }));

                self.refreshMqttConnection = true;
            });
        });
        this.mqttClient.on('error', (error) => {
            self.console.error("MQTT error: " + error);
        });
        this.mqttClient.on('reconnect', () => {
            self.console.info("MQTT reconnecting.");
        });
        this.mqttClient.on('close', () => {
            self.console.warn("MQTT disconnected.");
            self.refreshMqttConnection = false;
        });
        this.mqttClient.on('offline', () => {
            self.console.warn("MQTT offline.");
            self.refreshMqttConnection = false;
        });
        this.mqttClient.on('end', () => {
            self.console.warn("MQTT ended.");
            self.refreshMqttConnection = false;
        });
        this.mqttClient.on('message', (topic: string, payload: Buffer, packet: any) => {
            // Parses the payload
            const content = JSON.parse(payload.toString());

            // update the environmental data
            if (content.msg === 'ENVIRONMENTAL-CURRENT-SENSOR-DATA') {
                this.processEnvironmentalSensorData(content);
            }

            if (content.msg === 'CURRENT-STATE' || content.msg === 'STATE-CHANGE') {
                self.processingState = true;

                if (content.msg === 'CURRENT-STATE') {
                    this.processCurrentState(content);
                }

                if (content.msg === 'STATE-CHANGE') {
                    this.processStateChange(content);
                }

                self.processingState = false;
            }
        });
    }

    async getRefreshFrequency(): Promise<number> {
        return 60;
    }
    async refresh(refreshInterface: string, userInitiated: boolean): Promise<void> {
        if (!this.refreshMqttConnection)
            return;

        try {
            this.mqttClient.publish(this.baseMqttPath + '/command', JSON.stringify({
                msg: "REQUEST-CURRENT-STATE",
                time: new Date().toISOString()
            }));
        } catch (error) {
            self.console.error("MQTT interval error: " + error);
        }
    }

    updateSettings() {
        if (this.processingState) {
            return;
        }

        let commandData = this.getState();

        this.console.log(`updateSettings(): ${JSON.stringify(commandData)}`);
        this.setState(commandData);
    }

    async getSettings(): Promise<Setting[]> {
        let s = await this.storageSettings.getSettings();

        if (!this.capabilities)
            return s;

        let settings: Setting[] = [];
        for(const setting of s) {
            if (setting.key === "ipAddress" || setting.key === "serialNumber" || setting.key === "localPassword" || setting.key === "productType" || setting.key === "temperatureUnit")
                settings.push(setting);

            else if (setting.key === "autoMode" && (this.capabilities.includes("auto") || this.capabilities.includes("fmod")))
                settings.push(setting);

            else if (setting.key === "continuousMonitoring" && this.capabilities.includes("rhtm"))
                settings.push(setting);

            else if (setting.key === "nightMode" && this.capabilities.includes("nmod"))
                settings.push(setting);

            else if (setting.key === "swingMode" && this.capabilities.includes("oson"))
                settings.push(setting);

            else if (setting.key === 'swingModeCenter' && this.capabilities.includes("osal"))
                settings.push(setting);

            else if (setting.key === 'swingModeDegrees' && this.capabilities.includes("ancp"))
                settings.push(setting);

            else if (setting.key === "focusMode" && this.capabilities.includes("ffoc"))
                settings.push(setting);

            else if (setting.key === "backwardsAirflow" && this.capabilities.includes("fdir"))
                settings.push(setting);
        }

        return settings;
    }
    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }

    getState() : any {
        let commandData = {

        };
        return commandData;
    }

    setState(commandData: any) {
        this.mqttClient.publish(this.baseMqttPath + '/command', JSON.stringify({
            msg: 'STATE-SET',
            time: new Date().toISOString(),
            data: commandData
        }));
    }

    processEnvironmentalSensorData(content: any) {
    }

    processCurrentState(content: any) {
        if (!this.capabilities) {
            this.capabilities = [];
            for (const key of Object.keys(content['product-state'])) {
                this.capabilities.push(key);
            }
        }
    }

    logProcessStateChange(content: any) {
        const copy = JSON.parse(JSON.stringify(content)) as typeof content;
        copy['product-state'] = undefined;
        copy['changed-state'] = {}

        for (const key of Object.keys(content['product-state'])) {
            const state = content['product-state'][key];

            if (state[0] !== state[1]) {
                copy['changed-state'][key] = state;
            }
        }

        this.console.info(`processStateChange(${JSON.stringify(copy)})`);
    }

    processStateChange(content: any) {
        this.logProcessStateChange(content);
    }
}
