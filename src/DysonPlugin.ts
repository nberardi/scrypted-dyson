import sdk from '@scrypted/sdk'
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


export class DysonPlugin extends ScryptedDeviceBase implements DeviceDiscovery, DeviceProvider, Settings {
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
        if (!this.storageSettings.values.authorizationHeader) {
            this.putSetting("authorizationHeader", await this.getAuthorizationHeader());
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
                        ScryptedInterface.Settings,
                        ScryptedInterface.AirQualitySensor,
                        ScryptedInterface.OnOff,
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
                            product: product,
                            api: fan
                        }
                    }
                };

                if (product.hasAdvancedAirQualitySensors) {
                    d.interfaces.push(ScryptedInterface.Thermometer);
                    d.interfaces.push(ScryptedInterface.HumiditySensor);
                    d.interfaces.push(ScryptedInterface.PM25Sensor);
                    d.interfaces.push(ScryptedInterface.PM10Sensor);
                    d.interfaces.push(ScryptedInterface.NOXSensor);
                    d.interfaces.push(ScryptedInterface.VOCSensor);
                }

                if (product.hasHeating) {
                    d.type = ScryptedDeviceType.Thermostat;
                    d.interfaces.push(ScryptedInterface.Thermometer);
                    d.interfaces.push(ScryptedInterface.TemperatureSetting);
                }

                if (product.hasHumidifier) {
                    d.type = ScryptedDeviceType.Thermostat;
                    d.interfaces.push(ScryptedInterface.Thermometer);
                    d.interfaces.push(ScryptedInterface.HumiditySensor);
                    d.interfaces.push(ScryptedInterface.HumiditySetting);
                }

                const s = deviceManager.getDeviceStorage(d.nativeId);
                s.setItem("productType", fan.ProductType);
                s.setItem("serialNumber", fan.Serial);
                s.setItem("localPassword", localPasswordHash);

                devices.push(d);
            }

            await deviceManager.onDevicesChanged({
                providerNativeId: this.nativeId,
                devices
            });
        }
    }

    challengeId: string;
    accountStatus: any;
    authenticationMethod: string;

    async getAuthorizationHeader(): Promise<string> {
        const client = axios.create();
        const self = this;

        const catchError = function (error: AxiosError): void {
            let msg = "";
            if (error?.response) {
                msg = `[Status ${error.response.status} ${error.response.statusText}] ${error.response.data?.Message}`;
            } else {
                msg = error.message;
            }

            self.log.e(msg);
        };

        // verify account status and if 2FA is required
        if (!this.accountStatus || !this.authenticationMethod) {
            const step1 = await client(`https://appapi.cp.dyson.com/v3/userregistration/email/userstatus?country=${this.storageSettings.values.countryCode}`, {
                method: "POST",
                headers: {
                    "User-Agent": agent
                },
                data: {
                    email: this.storageSettings.values.email
                }
            })
                .then(function (response) {
                    self.console.log("login step 1", response.data);

                    self.accountStatus = response.data.accountStatus;
                    self.authenticationMethod = response.data.authenticationMethod;
                })
                .catch(catchError);
        }

        // get the challenge identity and send out an email with 2FA code
        if (this.authenticationMethod === "EMAIL_PWD_2FA" && !this.challengeId) {
            const step2 = await client(`https://appapi.cp.dyson.com/v3/userregistration/email/auth?country=${this.storageSettings.values.countryCode}`, {
                method: "POST",
                headers: {
                    "User-Agent": agent
                },
                data: {
                    email: this.storageSettings.values.email
                }
            })
                .then(function (response) {
                    self.console.log("login step 2", response.data);

                    self.challengeId = response.data.challengeId;

                    // reset 2FA code for user to re-enter
                    self.putSetting("otpCode", "");
                })
                .catch(catchError);
        }

        let authorizationHeader: string;

        if (this.authenticationMethod) {
            // once we have the callenge identity and 2FA code we can get the authorizationHeader
            if (this.authenticationMethod === "EMAIL_PWD_2FA" && this.challengeId && this.storageSettings.values.otpCode) {
                const step3mfa = await client(`https://appapi.cp.dyson.com/v3/userregistration/email/verify?country=${this.storageSettings.values.countryCode}`, {
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
                })
                    .then(function (response) {
                        self.console.log("login step 3 (2FA)", response.data);

                        authorizationHeader = `${response.data.tokenType} ${response.data.token}`;

                        // reset 2FA code for user to re-enter
                        self.putSetting("otpCode", "");
                    })
                    .catch(catchError);

            } else if (this.authenticationMethod !== "EMAIL_PWD_2FA") {
                const step3nofa = await client(`https://appapi.cp.dyson.com/v1/userregistration/authenticate?country=${this.storageSettings.values.countryCode}`, {
                    method: "POST",
                    headers: {
                        "User-Agent": agent
                    },
                    data: {
                        email: this.storageSettings.values.email,
                        password: this.storageSettings.values.password
                    }
                })
                    .then(function (response) {
                        self.console.log("login step 3 (NoFA)", response.data);

                        authorizationHeader = `Basic ${Buffer.from(response.data.account + ':' + response.data.password).toString("base64")}`;
                    })
                    .catch(catchError);
            }
        }

        return authorizationHeader;
    }
}
