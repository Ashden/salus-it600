"use strict";

const md5 = require("md5");
const xml = require("fast-xml-parser");
const bent = require("bent");
const post = bent(
  "https://eu.salusconnect.io/",
  'POST', 'json'
);
const get = bent(
"https://eu.salusconnect.io/",
'GET', 'json', 200
);

const APPID = "1097";
const ATTRIBUTES = {
  NAME: 2287,
  SUMMARY: 2257,
};
const MODES = [
  "OFFLINE",
  "AUTO_HIGH",
  "AUTO_MEDIUM",
  "AUTO_LOW",
  "HIGH",
  "MEDIUM",
  "LOW",
  "PARTY",
  "AWAY",
  "FROST",
  "ON",
  "ON",
  "UNDEFINED",
  "UNDEFINED",
  "UNDEFINED",
  "UNDEFINED",
  "OFFLINE",
  "AUTO_HIGH",
  "AUTO_MEDIUM",
  "AUTO_LOW",
  "HIGH",
  "MEDIUM",
  "LOW",
  "PARTY",
  "AWAY",
  "FROST",
  "ON",
];

const THERMOSTAT_MODEL = "SQ610RF";
const CURRENT_TEMP_PROP = "ep_9:sIT600TH:LocalTemperature_x100";
const TARGET_TEMP_PROP = "ep_9:sIT600TH:HeatingSetpoint_x100";
const RUNNING_MODE = "ep_9:sIT600TH:RunningMode";
const RUNNING_STATE = "ep_9:sIT600TH:RunningState";
const HUMIDITY = "ep_9:sIT600TH:SunnySetpoint_x100";
const MODE = "ep_9:sIT600TH:HoldType";

const summaryToValues = (summary) => ({
  current: (summary.charCodeAt(2) - 32) * 0.5,
  target: (summary.charCodeAt(3) - 32) * 0.5,
  mode: MODES[summary.charCodeAt(1) - 32],
  heating: summary.charCodeAt(1) - 32 > 9,
});

class Salus {
  constructor({ username, password }) {
    this.username = username;
    this.password = password;
  }

  async login() {
    try {
      const loginResponse = await post(
        `users/sign_in.json`,
        {
          "user":{"email":this.username,"password":this.password}
        }
      );
      console.log('Login successful!');
      this.session = loginResponse['access_token'];
      setInterval(this.login, (loginResponse['expires_in'] - 60) * 1000);
      this.getData();
      setInterval(this.getData.bind(this), 10000);
    } catch (e) {
      console.log(e);
      console.log('LOGIN');
      if (e.statusCode == 401) {
        this.session = undefined;
        // await this.login();
      }
    }
    
    
    // console.info('AFTER LOGIN!');
    // console.log(loginResponse);
    // const userLoginResponse = xml.parse(loginResponse, {
    //   ignoreNameSpace: true,
    // });
    // this.session = userLoginResponse.userLoginResponse;

    // const devicesResponse = await get(
    //   `getDeviceList?secToken=${this.session.securityToken}&userId=${
    //     this.session.userId
    //   }&timestamp=${new Date().getTime()}`
    // );
    // this.device = xml.parse(devicesResponse, {
    //   ignoreNameSpace: true,
    // }).getDeviceListResponse.devList;
    
  }

  _baseParameters() {
    return `secToken=${this.session.securityToken}&userId=${
      this.session.userId
    }&devId=${this.device.devId}&timestamp=${new Date().getTime()}`;
  }

  async _request({ method, parameters, _retry = false }) {
    if (!this.session) await this.login();
    const request = `${method}?${this._baseParameters()}&${parameters}`;
    try {
      const response = await get(request);
      return xml.parse(response, {
        ignoreNameSpace: true,
      });
    } catch (e) {
      // Do it again, once to avoid an infinite loop
      if (e.statusCode == 500 && _retry == false) {
        await this.login();
        return await this._request({
          method,
          parameters,
          _retry: true,
        });
      }
    }
  }

  async getData() {
    try {
      this.thermostats = await this.devices();
      this.areas = await this.groups();
      this.data = await this.getStats();
    } catch (e) {
      console.log(e);
      console.log('GETDATA');
      if (e.statusCode == 401) {
        this.session = undefined;
      }
    }
    
  }

  async devices() {
    // const response = await this._request({
    //   method: "getDeviceAttributesWithValues",
    //   parameters: `deviceTypeId=1`,
    // });
    // const deviceAttributes =
    //   response.getDeviceAttributesWithValuesResponse.attrList;
    // const namesAttribute = deviceAttributes.find(
    //   (attribute) => attribute.id == ATTRIBUTES["NAME"]
    // );
    // const summary = deviceAttributes
    //   .find((attribute) => attribute.id == ATTRIBUTES["SUMMARY"])
    //   .value.replace(/&amp;/g, "&")
    //   .match(/.{1,8}/g)
    //   .map((a) => ({
    //     id: a.substring(0, 4),
    //     value: a.substring(4),
    //   }));
    // const devices = namesAttribute.value
    //   .replace(/,$/, "")
    //   .split(",")
    //   .map((n) => ({
    //     id: n.substring(0, 4),
    //     name: n.substring(4),
    //     ...summaryToValues(
    //       summary.find((s) => s.id == n.substring(0, 4)).value
    //     ),
    //   }));
    // console.log('Devices: session is ' + this.session);
    if (!this.session) await this.login();
    
    let allDevices = await get('apiv1/devices.json', '', { 'Authorization': "Bearer " + this.session});
    // console.log(`Number of devices: ${allDevices.length}`);
    let devices = allDevices.filter(device => {
      return device.device.oem_model === THERMOSTAT_MODEL
    });
    // console.log(`Thermostats: ${devices.length}`);
    devices = devices.map(device => ({
      id: device.device.dsn,
      name: device.device.product_name,
      key: device.device.key
    }));

    return devices;
  }

  async groups() {
    // console.log('Groups: session is ' + this.session);
    if (!this.session) await this.login();

    let allGroups =  await get('apiv1/groups.json', '', { 'Authorization': "Bearer " + this.session});
    let groups = allGroups.filter(group => {
      return group.group.device_count > 0
    });
    groups = groups.map(group => ({
      name: group.group.name,
      key: group.group.key,
      device_count: group.group.device_count
    }));
    return groups;
  }

  async getStats() {
    // console.log('Stats: session is ' + this.session);
    let allData = [];
    await Promise.all(this.areas.map(async (group) => {
      const data = await get(`apiv1/groups/${group.key}/datapoints.json?` + 
      `property_names[]=${CURRENT_TEMP_PROP}&` +
      `property_names[]=${TARGET_TEMP_PROP}&` +
      `property_names[]=${RUNNING_MODE}&` +
      `property_names[]=${RUNNING_STATE}&` +
      `property_names[]=${HUMIDITY}&` +
      `property_names[]=${MODE}`,
      '', { 'Authorization': "Bearer " + this.session});
      allData.push(...data.datapoints.devices.device);
    }));
    this.stats = [];
    allData.forEach((data, index) => {
      let deviceData = {};
      deviceData.id = data.id;
      data.properties.property.forEach(prop => {
        if (prop.name == CURRENT_TEMP_PROP) {
          deviceData.current = prop.value;
        }
        if (prop.name == TARGET_TEMP_PROP) {
          deviceData.target = prop.value;
        }
        if (prop.name == RUNNING_STATE) {
          deviceData.running = prop.value == 1;
        }
        if (prop.name == RUNNING_MODE) {
          deviceData.heating = prop.value == 4;
        }
        if (prop.name == HUMIDITY) {
          deviceData.humidity = prop.value;
        }
        if (prop.name == MODE) {
          deviceData.mode = prop.value;
        }
      });
      this.stats.push(deviceData);
    })
    // console.log(JSON.stringify(this.stats));
    return allData;
  }

  async setTarget({ id, temperature }) {
    if (!id || !temperature)
      throw new Error("Both id and temperature named arguments must be set");
    const value = `!${id}${String.fromCharCode(temperature * 2 + 32)}`;
    const result = await this._request({
      method: "setMultiDeviceAttributes2",
      parameters: `name1=B06&value1=${encodeURIComponent(value)}`,
    });
    return result;
  }

  // async setMode({ id, mode, duration }) {
  //   const MODES = ["AUTO", "HIGH", "MEDIUM", "LOW", "PARTY", "AWAY", "FROST"];
  //   if (!id || !mode)
  //     throw new Error("Both id and mode named arguments must be set");
  //   if (!MODES.includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  //   /*
  //           35 - # - AUTO
  //           36 - $ - HIGH
  //           37 - % - MEDIUM
  //           38 - & - LOW
  //           39 - ' - PARTY (followed by zeropadded number of hours)
  //           40 - ( - AWAY (followed by zeropadded number of days)
  //           41 - ) - FROST
  //         */
  //   const value = `!${id}${String.fromCharCode(MODES.indexOf(mode) + 35)}${
  //     duration ? duration.toString().padStart(2, "0") : ""
  //   }`;
  //   const result = await this._request({
  //     method: "setMultiDeviceAttributes2",
  //     parameters: `name1=B05&value1=${encodeURIComponent(value)}`,
  //   });
  //   return result;
  // }
  async setMode({id, mode}) {
    console.log(`Setting mode ${mode} for device ${id}`);
    try {
      resp = await post('apiv1/dsns/' + id + '/properties/ep_9:sIT600TH:SetHoldType/datapoints.json', {"datapoint":{"value": mode}}, { 'Authorization': "Bearer " + this.session});
      return resp;
    } catch (e) {
    }
  }
}

module.exports = Salus;
