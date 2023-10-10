export class ProductInfo {

  static get(productType: string): any {
    let info = ProductInfo[productType];

    if (!info.hardwareRevision)
      info.hardwareRevision = '';
    if (!info.hasAdvancedAirQualitySensors)
      info.hasAdvancedAirQualitySensors = false;
    if (!info.hasHeating)
      info.hasHeating = false;
    if (!info.hasHumidifier)
      info.hasHumidifier = false;
    if (!info.hasJetFocus)
      info.hasJetFocus = false;
    if (!info.model)
      info.model = 'Dyson Purifier Unknown Model (file an issue)';
    return info;
  }

  model: undefined;
  hardwareRevision: undefined;
  hasJetFocus: undefined;
  hasAdvancedAirQualitySensors: undefined;
  hasHeating: undefined;
  hasHumidifier: undefined;

  static '358' = {
    model: 'Dyson Purifier Humidify+Cool',
    hardwareRevision: 'PH01',
    hasAdvancedAirQualitySensors: true,
    hasHumidifier: true,
    hasJetFocus: true,
  };

  static '358K' = {
    model: 'Dyson Purifier Humidify+Cool',
    hardwareRevision: 'PH03',
    hasAdvancedAirQualitySensors: true,
    hasHumidifier: true,
    hasJetFocus: true,
  };

  static '358E' = {
    model: 'Dyson Purifier Humidify+Cool Formaldehyde',
    hardwareRevision: 'PH04',
    hasAdvancedAirQualitySensors: true,
    hasHumidifier: true,
    hasJetFocus: true,
  };

  static '438' = {
    model: 'Dyson Purifier Cool Tower',
    hardwareRevision: 'TP04',
    hasJetFocus: true,
    hasAdvancedAirQualitySensors: true,
  };

  static '438K' = {
    model: 'Dyson Purifier Cool',
    hardwareRevision: 'TP07',
    hasJetFocus: true,
    hasAdvancedAirQualitySensors: true,
  };

  static '438E' = {
    model: 'Dyson Purifier Cool Formaldehyde',
    hardwareRevision: 'TP09',
    hasJetFocus: true,
    hasAdvancedAirQualitySensors: true,
  };

  static '455' = {
    model: 'Dyson Purifier Hot+Cool Link',
    hardwareRevision: 'HP02',
    hasHeating: true,
    hasJetFocus: true,
  };

  static '469' = {
    model: 'Dyson Purifier Cool Link Desk',
    hardwareRevision: 'DP01',
  };

  static '475' = {
    model: 'Dyson Purifier Cool Link',
    hardwareRevision: 'TP02'
  };

  static '520' = {
    model: 'Dyson Purifier Cool Purifying Desk',
    hardwareRevision: 'DP04',
    hasJetFocus: true,
    hasAdvancedAirQualitySensors: true,
  };

  static '527' = {
    model: 'Dyson Purifier Hot+Cool',
    hardwareRevision: 'HP04',
    hasJetFocus: true,
    hasAdvancedAirQualitySensors: true,
    hasHeating: true,
  };

  static '527K' = {
    model: 'Dyson Purifier Hot+Cool',
    hardwareRevision: 'HP07',
    hasJetFocus: true,
    hasAdvancedAirQualitySensors: true,
    hasHeating: true,
  };

  static '527E' = {
    model: 'Dyson Purifier Hot+Cool Formaldehyde',
    hardwareRevision: 'HP09',
    hasJetFocus: true,
    hasAdvancedAirQualitySensors: true,
    hasHeating: true,
  };

  static '664' = {
    model: 'Dyson Purifier Big+Quiet Series',
    hardwareRevision: 'BP02',
    hasAdvancedAirQualitySensors: true
  }
}
