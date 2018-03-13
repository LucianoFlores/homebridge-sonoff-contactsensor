
var Service, Characteristic;
var mqtt    = require('mqtt');

//Inyecto el complemento dentro de Homebridge
module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-sonoff-contactsensor", "sonoff-contactsensor", ContactSensorAccessorySonOff);
}

//ContactSensorAccessorySonOff es el objeto que contiene toda la lógica de control
function ContactSensorAccessorySonOff(log, config) {
	this.log = log;

	this.url = config['url'];
    this.publish_options = {									//Línea nueva
      qos: ((config["qos"] !== undefined)? config["qos"]: 0)	//Línea nueva
    };															//Línea nueva

	this.client_Id 		= 'mqttjs_' + Math.random().toString(16).substr(2, 8);
	this.options = {
		keepalive: 10,
		clientId: this.client_Id,
		protocolId: 'MQTT',
		protocolVersion: 4,
		clean: true,
		reconnectPeriod: 1000,
		connectTimeout: 30 * 1000,
		will: {
			topic: 'WillMsg',
			payload: 'Connection Closed abnormally..!',
			qos: 0,
			retain: false
		},
		username: config["username"],
		password: config["password"],
		rejectUnauthorized: false
	};

	this.topicStatusGet	= config["topics"].statusGet;
	this.topicsStateGet	= (config["topics"].stateGet  !== undefined) ? config["topics"].stateGet : "";

	this.onValue = (config["onValue"] !== undefined) ? config["onValue"]: "ON";
    this.offValue = (config["offValue"] !== undefined) ? config["offValue"]: "OFF";

	if (config["activityTopic"] !== undefined && config["activityParameter"] !== undefined) {
		this.activityTopic = config["activityTopic"];
	  	this.activityParameter = config["activityParameter"];
	}
	else {
		this.activityTopic = "";
	  	this.activityParameter = "";
	}

	this.name = config["name"];
	this.manufacturer = config['manufacturer'] || "ITEAD";
	this.model = config['model'] || "Sonoff";
	this.serialNumberMAC = config['serialNumberMAC'] || "";

	//Inicializo la variable a contacto no detetado = 1
	this.contactDetected = Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

	this.service = new Service.ContactSensor(this.name);

	this.service
    	.getCharacteristic(Characteristic.ContactSensorState)
    	.on('get', this.getStatus.bind(this))

	if(this.activityTopic !== "") {
		this.service.addOptionalCharacteristic(Characteristic.StatusActive);
		this.service
			.getCharacteristic(Characteristic.StatusActive)
			.on('get', this.getStatusActive.bind(this));
	}

	this.client  = mqtt.connect(this.url, this.options);
	var that = this;

	//Caso de error
	this.client.on('error', function () {
		that.log('Error event on MQTT');
	});

	//Caso conexión inicial
	this.client.on('connect', function () {
		if (config["startCmd"] !== undefined && config["startParameter"] !== undefined) {
			that.client.publish(config["startCmd"], config["startParameter"]);
		}
	});

	//Caso mensaje recibido
	this.client.on('message', function (topic, message) {
		if (topic == that.topicStatusGet) {
			var status = message.toString();
			//status contiene el estado del Sonoff
			//that.contactDetected es el estado que activaré en Home
			that.contactDetected = (status == this.onValue) ? 0 : 1;	//0 = Hay contacto, 1 = No hay contacto
		   	that.service.getCharacteristic(Characteristic.ContactSensorState).setValue(that.contactDetected, undefined);
		}
		
		if (topic == that.topicsStateGet) {
			var data = JSON.parse(message);
			
			if (data.hasOwnProperty("POWER")) { 
				var status = data.POWER;
				that.contactDetected = (status == this.onValue);   //!!!! AQUÍ PUEDE FALTAR...  ? 0 : 1
		   		that.service.getCharacteristic(Characteristic.ContactSensorState).setValue(that.contactDetected, undefined);
			}
		} else if (topic == that.activityTopic) {
			var status = message.toString(); 	
			that.activeStat = (status == that.activityParameter);
			that.service.setCharacteristic(Characteristic.StatusActive, that.activeStat);
		}
	});

	//Me suscribo a los topics
    this.client.subscribe(this.topicStatusGet);

	if(this.topicsStateGet !== ""){
	  	this.client.subscribe(this.topicsStateGet);
 	}
	if(this.activityTopic !== ""){
	  	this.client.subscribe(this.activityTopic);
 	}
}


ContactSensorAccessorySonOff.prototype.getStatus = function(callback) {
    callback(null, this.contactDetected);
}

ContactSensorAccessorySonOff.prototype.setStatus = function(status, callback) {
	this.contactDetected = status;
	this.client.publish(this.topicStatusSet, status ? this.onValue : this.offValue, this.publish_options);
	callback();
}

ContactSensorAccessorySonOff.prototype.getStatusActive = function(callback) {
    callback(null, this.activeStat);
}

ContactSensorAccessorySonOff.prototype.getOutletUse = function(callback) {
    callback(null, true); // If configured for outlet - always in use (for now)
}

ContactSensorAccessorySonOff.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	informationService
		.setCharacteristic(Characteristic.Name, this.name)
		.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
		.setCharacteristic(Characteristic.Model, this.model)
		.setCharacteristic(Characteristic.SerialNumber, this.serialNumberMAC);

	return [informationService, this.service];
}
