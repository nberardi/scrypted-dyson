import sdk, { DeviceCreator, DeviceCreatorSettings } from '@scrypted/sdk'
import axios, { AxiosError, AxiosResponse } from 'axios';
import { Device, DeviceDiscovery, DeviceProvider, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface, Setting, Settings, SettingValue } from '@scrypted/sdk';
import { StorageSettings } from "@scrypted/sdk/storage-settings"
import { ProductInfo } from "./ProductInfo";
import { createDecipheriv } from 'crypto';
import { DysonFan } from './DysonFan';
import { DysonFanWithHeater } from './DysonFanWithHeater';
import { DysonFanWithHumidifier } from './DysonFanWithHumidifier';
import { DysonFanWithAdvancedAirQuality } from './DysonFanWithAdvancedAirQuality';

const { deviceManager } = sdk;
const agent = "DysonLink/42702 CFNetwork/133 5.0.3 Darwin/21.6.0";


export class DysonPlugin extends ScryptedDeviceBase implements DeviceDiscovery, DeviceProvider, DeviceCreator, Settings {
    storageSettings = new StorageSettings(this, {
        countryCode: {
            title: "Country Code",
            type: "string",
            description: "Enter the country code of the country your Dyson account is registered in. (e.g. US for United States, DE for Germany, GB for Great Britain, etc.)",
        },
        email: {
            title: "Email",
            type: "string",
            description: "The email for your Dyson account.",
        },
        password: {
            title: "Password",
            type: "password",
            onPut: () => this.discoverDevices()
        },
        otpCode: {
            title: "Email Code",
            description: "The two-factor auth code you received in your email.",
            onPut: () => this.discoverDevices()
        },
        authorizationHeader: {
            title: "Token",
            description: "The auth token used by Dyson.",
            type: "string",
            onPut: () => this.discoverDevices()
        }
    });

    fans = new Map<string, DysonFan>();

    constructor(nativeId?: string) {
        super(nativeId);
        this.discoverDevices();
    }

    async getCreateDeviceSettings(): Promise<Setting[]> {
        return [
            {
                key: 'name',
                title: 'Name',
                description: 'The name of the fan.',
            },
            {
                key: 'ipAddress',
                title: "IP Address",
                type: "string",
                placeholder: "192.168.1.XX",
                description: "The IP Address of the fan on your local network."
            },
            {
                key: "serialNumber",
                title: "Serial Number",
                type: "string",
                description: "The Serial Number of the Dyson fan.",
            },
            {
                key: "localPassword",
                title: "Credentials",
                type: "string",
                description: "Local credentials for accessing the device.",
            },
            {
                key: "productType",
                title: "Product Type",
                type: "string",
                description: "The numberical product type provided by Dyson.",
                choices: ['358', '358E', '438', '438E', '455', '469', '475', '520', '527', '527E']
            }
        ];
    }

    async createDevice(settings: DeviceCreatorSettings): Promise<string> {
        const name = settings.name.toString();
        const ipAddress = settings.ipAddress.toString();
        const serialNumber = settings.serialNumber.toString();
        const productType = settings.productType.toString();
        const localPassword = settings.localPassword.toString();
        const product = ProductInfo.get(productType);

        const d: Device = {
            providerNativeId: this.nativeId,
            name: name,
            type: ScryptedDeviceType.Fan,
            nativeId: serialNumber,
            interfaces: [
                ScryptedInterface.Fan,
                ScryptedInterface.Thermometer,
                ScryptedInterface.HumiditySensor,
                ScryptedInterface.AirQualitySensor,
                ScryptedInterface.OnOff,
                ScryptedInterface.Settings,
                ScryptedInterface.Online,
                ScryptedInterface.Refresh
            ],
            info: {
                model: product.model,
                manufacturer: 'Dyson',
                serialNumber: serialNumber,
                version: productType,
                metadata: {
                    localPasswordHash: localPassword,
                    productType: productType,
                    product: product,
                }
            }
        };

        if (product.hasAdvancedAirQualitySensors) {
            d.interfaces.push(ScryptedInterface.PM25Sensor);
            d.interfaces.push(ScryptedInterface.PM10Sensor);
            d.interfaces.push(ScryptedInterface.NOXSensor);
            d.interfaces.push(ScryptedInterface.VOCSensor);
        }

        if (product.hasHeating) {
            d.interfaces.push(ScryptedInterface.TemperatureSetting);
        }

        if (product.hasHumidifier) {
            d.interfaces.push(ScryptedInterface.HumiditySensor);
            d.interfaces.push(ScryptedInterface.HumiditySetting);
        }

        await deviceManager.onDeviceDiscovered(d);

        const s = deviceManager.getDeviceStorage(d.nativeId);
        s.setItem("ipAddress", ipAddress);
        s.setItem("serialNumber", serialNumber);
        s.setItem("productType", productType);
        s.setItem("localPassword", localPassword);

        return serialNumber;
    }

    getSettings(): Promise<Setting[]> {
        return this.storageSettings.getSettings();
    }

    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.storageSettings.putSetting(key, value);
    }

    async getDevice(nativeId: string): Promise<DysonFan> {
        if (this.fans.has(nativeId))
            return this.fans.get(nativeId);

        let s = deviceManager.getDeviceStorage(nativeId);
        if (s) {
            const productType = s.getItem("productType");
            const product = ProductInfo.get(productType);

            let d: DysonFan;

            if (product.hasHeating) {
                d = new DysonFanWithHeater(nativeId);
            }

            else if (product.hasHumidifier) {
                d = new DysonFanWithHumidifier(nativeId);
            }

            else if (product.hasAdvancedAirQualitySensors) {
                d = new DysonFanWithAdvancedAirQuality(nativeId);
            }

            else {
                d = new DysonFan(nativeId);
            }

            this.fans.set(nativeId, d);
            return d;
        }

        return undefined;
    }

    async discoverDevices(duration?: number): Promise<void> {
        let currentDevices = deviceManager.getNativeIds();

        //if (currentDevices?.length > 0)
        //    return;
        if (!this.storageSettings.values.countryCode || !this.storageSettings.values.email || !this.storageSettings.values.password) {
            this.log.a('Enter your Country Code, Email and Password to discover your Dyson Fans.');
            return;
        }

        // authentication can be skipped if we have an authorization header
        if (this.storageSettings.values.authorizationHeader === undefined) {
            var authorizationHeader = await this.getAuthorizationHeader();

            if (authorizationHeader === undefined) {
                this.console.error("aborting, authorization header not provided");
                return;
            }

            this.storageSettings.values.authorizationHeader = authorizationHeader;
        }

        if (this.storageSettings.values.authorizationHeader) {
            const client = axios.create();
            let fans: AxiosResponse;
            let self = this;

            await client("https://appapi.cp.dyson.com/v2/provisioningservice/manifest", {
                method: "GET",
                headers: {
                    "User-Agent": agent,
                    "Authorization": this.storageSettings.values.authorizationHeader
                },
                data: {
                    email: this.storageSettings.values.email
                }
            }).then(function (response) {
                self.console.log("devices", response);

                fans = response;
            });

            const devices: Device[] = [];

            for (const fan of fans.data) {
                if (!fan.LocalCredentials)
                    continue;

                // Gets the MQTT credentials from the device (see https://github.com/CharlesBlonde/libpurecoollink/blob/master/libpurecoollink/utils.py)
                const key = Uint8Array.from(Array(32), (_, index) => index + 1);
                const initializationVector = new Uint8Array(16);
                const decipher = createDecipheriv('aes-256-cbc', key, initializationVector);
                const localPasswordString = decipher.update(fan.LocalCredentials, 'base64', 'utf8') + decipher.final('utf8');
                const localPasswordJson = JSON.parse(localPasswordString);
                const localPasswordHash = localPasswordJson.apPasswordHash;

                let product = ProductInfo.get(fan.ProductType);

                const d: Device = {
                    providerNativeId: this.nativeId,
                    name: fan.Name,
                    type: ScryptedDeviceType.Fan,
                    nativeId: fan.Serial,
                    interfaces: [
                        ScryptedInterface.Fan,
                        ScryptedInterface.Thermometer,
                        ScryptedInterface.HumiditySensor,
                        ScryptedInterface.AirQualitySensor,
                        ScryptedInterface.OnOff,
                        ScryptedInterface.Settings,
                        ScryptedInterface.Online,
                        ScryptedInterface.Refresh
                    ],
                    info: {
                        model: product.model,
                        manufacturer: 'Dyson',
                        serialNumber: fan.Serial,
                        firmware: fan.Version,
                        version: fan.ProductType,
                        metadata: {
                            localPassword: localPasswordJson,
                            localPasswordHash: localPasswordHash,
                            productType: fan.ProductType,
                            product: product,
                            api: fan
                        }
                    }
                };

                if (product.hasAdvancedAirQualitySensors) {
                    d.interfaces.push(ScryptedInterface.PM25Sensor);
                    d.interfaces.push(ScryptedInterface.PM10Sensor);
                    d.interfaces.push(ScryptedInterface.NOXSensor);
                    d.interfaces.push(ScryptedInterface.VOCSensor);
                }

                if (product.hasHeating) {
                    d.interfaces.push(ScryptedInterface.TemperatureSetting);
                }

                if (product.hasHumidifier) {
                    d.interfaces.push(ScryptedInterface.HumiditySensor);
                    d.interfaces.push(ScryptedInterface.HumiditySetting);
                }

                devices.push(d);
            }

            await deviceManager.onDevicesChanged({
                providerNativeId: this.nativeId,
                devices
            });

            // prime the values in the device settings
            for (const d of devices) {
                const s = deviceManager.getDeviceStorage(d.nativeId);
                s.setItem("serialNumber", d.info.serialNumber);
                s.setItem("productType", d.info.metadata.productType);
                s.setItem("localPassword", d.info.metadata.localPasswordHash);
            }
        }
    }

    challengeId: string;
    accountStatus: any;
    authenticationMethod: string;

    async getAuthorizationHeader(): Promise<string> {
        const client = axios.create();
        const self = this;

        const catchError = function (error: AxiosError) {
            let msg = `[Status ${error.response.status} ${error.response.statusText}] ${error.response.data?.Message}`;
            self.console.error(msg);
            self.log.e(msg);
        };

        const otpCode: string = (this.storageSettings.values.otpCode ?? "").trim();

        // if the OTP code has not been set then lets request one
        if (otpCode.length === 0) {

            // verify account status and if 2FA is required
            if (!this.accountStatus || !this.authenticationMethod) {
                try {
                    const step1Response = await client(`https://appapi.cp.dyson.com/v3/userregistration/email/userstatus?country=${this.storageSettings.values.countryCode}`, {
                        method: "POST",
                        headers: {
                            "User-Agent": agent
                        },
                        data: {
                            email: this.storageSettings.values.email
                        }
                    });

                    if (step1Response.status === 200) {
                        self.console.log("login step 1", step1Response.data);

                        self.accountStatus = step1Response.data.accountStatus;
                        self.authenticationMethod = step1Response.data.authenticationMethod;
                    } 
                } catch (error) {
                    catchError(error);
                    return undefined;
                }
            }

            // get the challenge identity and send out an email with 2FA code
            if (!this.challengeId) {
                try {
                    const step2Response = await client(`https://appapi.cp.dyson.com/v3/userregistration/email/auth?country=${this.storageSettings.values.countryCode}&culture=en-US`, {
                        method: "POST",
                        headers: {
                            "User-Agent": agent
                        },
                        data: {
                            email: this.storageSettings.values.email
                        }
                    });

                    if (step2Response.status === 200) {
                        self.console.log("login step 2", step2Response.data);

                        self.challengeId = step2Response.data.challengeId;

                        // reset 2FA code for user to re-enter
                        this.storageSettings.values.otpCode = undefined;
                        this.log.w("Check your email for a One-Time Password, and enter it the settings.")
                    } 
                } catch (error) {
                    catchError(error);
                    return undefined;
                }
            }
        }

        let authorizationHeader: string;

        // once we have the callenge identity and 2FA code we can get the authorizationHeader
        if (this.challengeId && this.storageSettings.values.otpCode) {
            try {
                const step3mfaResponse = await client(`https://appapi.cp.dyson.com/v3/userregistration/email/verify`, {
                    method: "POST",
                    headers: {
                        "User-Agent": agent
                    },
                    data: {
                        email: this.storageSettings.values.email,
                        password: this.storageSettings.values.password,
                        challengeId: this.challengeId,
                        otpCode: this.storageSettings.values.otpCode
                    }
                });

                if (step3mfaResponse.status === 200) {
                    self.console.log("login step 3 (2FA)", step3mfaResponse.data);

                    authorizationHeader = `${step3mfaResponse.data.tokenType} ${step3mfaResponse.data.token}`;

                    // reset 2FA code for user to re-enter
                    this.storageSettings.values.otpCode = undefined;
                    this.console.log("One-Time Password reset as it is not needed any longer.");
                } 
            } catch (error) {
                catchError(error);
                return undefined;
            }

        }

        return authorizationHeader;
    }
}
