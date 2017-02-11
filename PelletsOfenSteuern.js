/* Beschreibung: V0.0.1
Steuerung des Pelletsofen im Wohnzimmer nach einer Schaltzeittabelle die
in einem state im JSON Format abgespeichert ist
Die Schaltzeiten koennen durch den ical-Adapter ueberschrieben werden, wenn
im entsprechenden Kalender folgende Termine vorhanden sind:
PelletsOFF      = Temperaturprofil OFF
PelletsHIGH     = Temperaturprofil HIGH
PelletsMIDDLE   = Temperaturprofil MIDDLE
PelletsEND      = Temperaturprofil END

die einzelnen Temperaturprofile sind jeweils in einem State fuer HIG/LOW gespeichert

Aufloesungsgenauigkeit der Schaltzeitensind 15 Minuten
*/

/* ******************************************************
                   Temeratur Profile
 ********************************************************/
const PELLETS_TEMP_OFF      = "OFF";
const PELLETS_TEMP_MIDDLE   = "MIDDLE";
const PELLETS_TEMP_HIGH     = "HIGH";
const PELLETS_TEMP_END      = "END";
const PELLETS_TEMP_UNKNOWN  = "UNKNOWN";

/* ******************************************************
Default Werte fuer Temperaturen der Pelletsofensteuerung,
die bei der Erstinitalisierung der Temperaturprofile
verwendet werden
 ********************************************************/
const PELLETS_ON_HIGH_TEMP      = 25.1;
const PELLETS_ON_LOW_TEMP       = 23.0;
const PELLETS_END_HIGH_TEMP     = 24.5;
const PELLETS_END_LOW_TEMP      = 22.5;
const PELLETS_OFF_HIGH_TEMP     = 10.0;
const PELLETS_OFF_LOW_TEMP      =  5.0;
const PELLETS_MIDDLE_HIGH_TEMP  = 23.1;
const PELLETS_MIDDLE_LOW_TEMP   = 21.1;

/* Verwendete States zuweisen (ioBroker)*/
const STATE_PELLETS_TIMER       = 'Heizung.Wohnzimmer.Pelletsofen.pelletsTimer' ;
const STATE_DEF_ON_HIGH_TEMP    = 'Heizung.Wohnzimmer.Pelletsofen.defPelletsOnHighTemp';
const STATE_DEF_ON_LOW_TEMP     = 'Heizung.Wohnzimmer.Pelletsofen.defPelletsOnLowTemp';
const STATE_DEF_OFF_HIGH_TEMP   = 'Heizung.Wohnzimmer.Pelletsofen.defPelletsOffHighTemp';
const STATE_DEF_OFF_LOW_TEMP    = 'Heizung.Wohnzimmer.Pelletsofen.defPelletsOffLowTemp';
const STATE_DEF_END_HIGH_TEMP   = 'Heizung.Wohnzimmer.Pelletsofen.defPelletsEndHighTemp';
const STATE_DEF_END_LOW_TEMP    = 'Heizung.Wohnzimmer.Pelletsofen.defPelletsEndLowTemp';
const STATE_DEF_MIDDLE_HIGH_TEMP= 'Heizung.Wohnzimmer.Pelletsofen.defPelletsMiddleHighTemp';
const STATE_DEF_MIDDLE_LOW_TEMP = 'Heizung.Wohnzimmer.Pelletsofen.defPelletsMiddleLowTemp';
/* States des ical Adapters */
const STATE_ICAL_PELLETS_OFF    = 'ical.0.events.PelletsOFF';
const STATE_ICAL_PELLETS_HIGH   = 'ical.0.events.PelletsHIGH';
const STATE_ICAL_PELLETS_MIDDLE = 'ical.0.events.PelletsMIDDLE';
const STATE_ICAL_PELLETS_END    = 'ical.0.events.PelletsEND';



/* ********************** Hauptprogramm ******************* */

/* States der homematic rausfinden, ob diese gültig sind, wird in SetTempToHomematic geprüft
wenn die Namen doppelt vorkommen, muss hier statt getIdByName der State eingetragen werden
ersichtlich im Log wird dieser fehler als ERROR ausgegeben
HMSTATE_PELLETS_TEMP_HIGH = 'hm-rega.0.xxxxx'
HMSTATE_PELLETS_TEMP_LOW  = ''hm-rega.0.yyyy' */
var hmStatePelletsTempHigh = getIdByName("PelletsTempHigh");
var hmStatePelletsTempLow  = getIdByName("PelletsTempLow")


var pelletsTimer = null;                  // Timertabelle (Objekt) fuer Pelletsofen Schaltzeiten
var bOverride = false;                    // true, wenn Kalender steuert
var sOverrideMode = PELLETS_TEMP_UNKNOWN; // Temperaturprofil bei Kalendersteuerung


stateCreate(); // Benoetigte States initalisieren, sofern noch nicht vorhanden

// alle 15 Minuten pruefen ob durch Schaltzeittabelle aenderungen erforderlich sind
schedule("1,16,31,46 * * * *", function() {setCurrentTemp();});

// Events bei Kalendersteuerung von ical Adapter
on ({id: STATE_ICAL_PELLETS_HIGH,   change: "ne" }, setCalendarControl);
on ({id: STATE_ICAL_PELLETS_MIDDLE, change: "ne" }, setCalendarControl);
on ({id: STATE_ICAL_PELLETS_END,    change: "ne" }, setCalendarControl);
on ({id: STATE_ICAL_PELLETS_OFF,    change: "ne" }, setCalendarControl);

/* Events der Kalendersteuerung verarbeiten*/
function setCalendarControl() {
  var flag = false;                 // Ist true, wenn Schaltzeiten Override von Kalender
  var ov = PELLETS_TEMP_UNKNOWN;    // Enthaelt das Temperaturprofil bei Kalendersteuerung

  if(getState(STATE_ICAL_PELLETS_OFF).val === true) {
    // Kalender steuert auf OFF (Prio 1)
    ov = PELLETS_TEMP_OFF;
    flag = true;
  } else if(getState(STATE_ICAL_PELLETS_END).val === true) {
    // Kalender steuert auf END (Prio 2)
    ov = PELLETS_TEMP_END;
    flag = true;
  } else if(getState(STATE_ICAL_PELLETS_MIDDLE).val === true) {
    // Kalender steuert auf MIDDLE (Prio 3)
    ov = PELLETS_TEMP_MIDDLE;
    flag = true;
  } else if(getState(STATE_ICAL_PELLETS_HIGH).val === true) {
    // Kalender steuert auf HIGH (Prio 4)
    ov = PELLETS_TEMP_HIGH;
    flag = true;
  }

  // Flags fuer Override und Temperatur Profil setzen
  if(flag === true) {
    sOverrideMode = ov;
    bOverride = true;
    log("Pellets Temperatursteuerung vom Kalender! Modus: " + sOverrideMode, 'info');
  } else {
    bOverride = false;
    log("Pellets Temperatursteuerung ueber Schaltzeittabelle aktiv!", 'info');
  }

  setCurrentTemp();     // Temperaturprofil in der Homematic setzen

}

function setCurrentTemp() {
    /* Den zur Zeit gueltigen Modus aus der Timertabelle holen und die
    Temperaturen in die Homematic speichern oder das Temperaturprofil
    der Kalendersteuerung verwenden, wenn override aktiv*/
    var today = new Date();             // Aktuelles Datum
    var weekday = today.getDay();       // Aktueller Wochentag
    var tnow = 0;                       // Aktuelle Zeit in einfachem Zahlenformat
    var ttest = 0;                      // Testzeit fuer vergleiche
    var ap = 0;                         // Anzahl der vorhandenen Schaltzeiten
    var foundIDX = null;                // Wenn ein Schaltzeitraum gefunden wurde dessen index


    /* Pellets Timer Objekt bei Bedarf erstellen*/
    if ( pelletsTimer === null) {
        /* Das Pellets Timerobjekt ist noch nicht initalisiert,
        dieser Zustand tritt ein, wenn das Script neu gestartet wurde */
        if(getState(STATE_PELLETS_TIMER).val === "noData") {
            /* Der State mit dem JSON OBjekt ist leer dies tritt ein, wenn
            der state fuer das JSON Objekt neu erstellt wurde
            dann muss das Timer Objekt neu initalisiert werden und dann die Daten
            in den State geschrieben werden, von dort kann dann bei einem Neustart
            des Scripts die Schaltzeittabelle in das Timer Objekt eingelesen werden*/
            pelletsTimerInit(); // State und Objekt initalisieren
        } else {
            // State mit JSON Daten ist vorhanden, dann daraus das Timer Objekt erstellen
            pelletsTimer = JSON.parse(getState(STATE_PELLETS_TIMER).val ,(key, value) => {return value;});
            log("setCurrentTemp: Pellets Timertabelle wurde von State in Objekt *pelletsTimer* geladen", 'info');
        }
    }

    // Wenn Override aktiv, das Temperaturprofil des Kalenders uebernehmen
    if (bOverride) {setTempToHomematic(sOverrideMode); return;}

    tnow = today.getHours() * 100 + today.getMinutes(); //Aktuelle Zeit in einfaches Zahlenformat umrechnen
    ap = pelletsTimer.day[weekday].point.length;  // Anzahl der vorhandenen Schaltzeitpunke
    for (r=ap-1; r >= 0 ; r--) {
        ttest = pelletsTimer.day[weekday].point[r].h *100 + pelletsTimer.day[weekday].point[r].m;
        if ( ttest <= tnow) {
            foundIDX = r;
            break;
        }
    }

    if(foundIDX !== null) {
        // Es wurde ein passender Zeitabschnitt gefunden
        if (foundIDX < ap) {
            setTempToHomematic(pelletsTimer.day[weekday].point[r].mode);
        } else {
            log("Fehlerhafte Schaltzeittabelle!", 'error');
        }
    } else {
        //Kein passender Zeitabschnitt gefunden
        log("setCurrentTemp: Kein Zeitabschnitt in Temperaturtabelle fuer'"
        + pelletsTimer.day[weekday].point[ap].name
        + " Uhrzeit " + tnow
        + " gefunden!", 'warn');
    }
}

/* Schreibt die Temperaturdaten in die Homematic, anhand des uebergebenen Modus*/
function setTempToHomematic(smode) {
    var tempHigh;
    var tempLow;

    switch(smode) {
        case PELLETS_TEMP_OFF:
            tempHigh = getState(STATE_DEF_OFF_HIGH_TEMP).val;
            tempLow =  getState(STATE_DEF_OFF_LOW_TEMP).val;
            break;
        case PELLETS_TEMP_MIDDLE:
            tempHigh = getState(STATE_DEF_MIDDLE_HIGH_TEMP).val;
            tempLow =  getState(STATE_DEF_MIDDLE_LOW_TEMP).val;
            break;
        case PELLETS_TEMP_HIGH:
            tempHigh = getState(STATE_DEF_ON_HIGH_TEMP).val;
            tempLow =  getState(STATE_DEF_ON_LOW_TEMP).val;
            break;
        case PELLETS_TEMP_END:
            tempHigh = getState(STATE_DEF_END_HIGH_TEMP).val;
            tempLow =  getState(STATE_DEF_END_LOW_TEMP).val;
            break;
        default:
            log("Ungueltiger Temperaturmode: '" + smode + "' Temperatur wurde auf minimal gesetzt", 'error');
            tempHigh = getState(STATE_DEF_OFF_HIGH_TEMP).val;
            tempLow =  getState(STATE_DEF_OFF_LOW_TEMP).val;
    }

    // Puefen, ob die States auch richtig benamt sind
    if(typeof hmStatePelletsTempLow != 'string'  ) {
      log("LowTemp State nicht gefunden, Konfiguration pruefen (hmStatePelletsTempLow), Temperatur konnte nicht in Homematic geschrieben werden", 'error');
      return;
    }
    if(typeof hmStatePelletsTempHigh != 'string'  ) {
      log("HighTemp State nicht gefunden, Konfiguration pruefen (hmStatePelletsTempHigh), Temperatur konnte nicht in Homematic geschrieben werden", 'error');
      return;
    }
    // Schreiben der Temperaturwerte in die Homematic
    if(getState(hmStatePelletsTempHigh).val != tempHigh){
      setState(hmStatePelletsTempHigh, tempHigh);
      log("Set HomematicState Temp HIGH = " + tempHigh , 'info');
    }
    if(getState(hmStatePelletsTempLow).val != tempLow){
      setState(hmStatePelletsTempLow, tempLow);
      log("Set HomematicState Temp LOW = " + tempLow , 'info');
    }

}

function pelletsTimerInit() {
    /* Standard Heiztabelle fuer Pelletsofen generieren und in State speichern*/
    pelletsTimer = {
        "day": [
               {   "name":   "Sonntag",
                "number": 0,
                "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                            {"h":  7, m: 30, "mode": PELLETS_TEMP_HIGH     },
                            {"h": 10, m:  0, "mode": PELLETS_TEMP_MIDDLE   },
                            {"h": 13, m:  0, "mode": PELLETS_TEMP_HIGH     },
                            {"h": 22, m:  0, "mode": PELLETS_TEMP_END      },
                            {"h": 22, m: 30, "mode": PELLETS_TEMP_OFF      }   ]   },
            {   "name":   "Montag",
                "number": 1,
                "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                            {"h":  0, m: 45, "mode": PELLETS_TEMP_HIGH     },
                            {"h":  9, m: 30, "mode": PELLETS_TEMP_MIDDLE   },
                            {"h": 13, m:  0, "mode": PELLETS_TEMP_HIGH     },
                            {"h": 21, m: 30, "mode": PELLETS_TEMP_END      },
                            {"h": 22, m:  0, "mode": PELLETS_TEMP_OFF      }     ]   },

            {   "name":   "Dienstag",
                "number": 2,
                "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                            {"h":  5, m: 45, "mode": PELLETS_TEMP_HIGH     },
                            {"h":  9, m: 30, "mode": PELLETS_TEMP_MIDDLE   },
                            {"h": 13, m:  0, "mode": PELLETS_TEMP_HIGH     },
                            {"h": 21, m: 30, "mode": PELLETS_TEMP_END      },
                            {"h": 22, m:  0, "mode": PELLETS_TEMP_OFF      }   ]   },

            {   "name":   "Mittwoch",
                "number": 3,
                "point": [  {"h":  0, m:  0, "mode":  PELLETS_TEMP_OFF     },
                            {"h":  5, m: 45, "mode":  PELLETS_TEMP_HIGH    },
                            {"h":  9, m: 30, "mode":  PELLETS_TEMP_MIDDLE  },
                            {"h": 13, m:  0, "mode":  PELLETS_TEMP_HIGH    },
                            {"h": 21, m: 30, "mode":  PELLETS_TEMP_END     },
                            {"h": 22, m:  0, "mode":  PELLETS_TEMP_OFF     }   ]   },

            {   "name":   "Donnerstag",
                "number": 4,
                "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                            {"h":  5, m: 45, "mode": PELLETS_TEMP_HIGH     },
                            {"h":  9, m: 30, "mode": PELLETS_TEMP_MIDDLE   },
                            {"h": 13, m:  0, "mode": PELLETS_TEMP_HIGH     },
                            {"h": 21, m: 30, "mode": PELLETS_TEMP_END      },
                            {"h": 22, m:  0, "mode": PELLETS_TEMP_OFF      }   ]   },

            {   "name":   "Freitag",
                "number": 5,
                "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                            {"h":  5, m: 45, "mode": PELLETS_TEMP_HIGH     },
                            {"h":  9, m: 30, "mode": PELLETS_TEMP_MIDDLE   },
                            {"h": 13, m:  0, "mode": PELLETS_TEMP_HIGH     },
                            {"h": 22, m:  0, "mode": PELLETS_TEMP_END      },
                            {"h": 22, m: 30, "mode": PELLETS_TEMP_OFF      }   ]   },

            {   "name":   "Samstag",
                "number": 6,
                "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                            {"h":  7, m: 30, "mode": PELLETS_TEMP_HIGH     },
                            {"h": 10, m:  0, "mode": PELLETS_TEMP_MIDDLE   },
                            {"h": 13, m:  0, "mode": PELLETS_TEMP_HIGH     },
                            {"h": 22, m:  0, "mode": PELLETS_TEMP_END      },
                            {"h": 22, m: 30, "mode": PELLETS_TEMP_OFF      }   ]   }


        ]
    };
    setState(STATE_PELLETS_TIMER, JSON.stringify(pelletsTimer,(key, value) => {return value;},2));
    log("pelletsTimerInit: Pellets Timer Tabelle wurde initalisiert und wurde zurueck gesetzt", 'warn');
}

function stateCreate() {
    /* Alle benoetigten Strukturen und Objekte initalisieren */

    // State fuer Timer Infos erstellen wenn noch nicht erfolgt
    createState(STATE_PELLETS_TIMER, {
        name:   'Schaltzeittabelle fuer den Pelletsofen im JSON Format',
        type:   'string',
        read:   true,
        write:  true,
        def:    "noData"
    });

    /* *******************************************************************
    States fuer default Temperatur Werte, die bei Temperaturaenderungen
    benutzt werden, die Steuerung greift auf diese Werte zurueck, wenn
    Temperatureinstellungen vorgenommen werden
    ********************************************************************/
    createState(STATE_DEF_ON_HIGH_TEMP, {
        name:   'Default Temperatur, bei der der Pelletsofen im Heizzustand abgeschaltet wird',
        desc:   'Dieser Wert sollte nur von einem SetupScript geaendert werden',
        type:   'number',
        read:   true,
        write:  true,
        min:     0.0,
        max:    40.0,
        def:    PELLETS_ON_HIGH_TEMP,
        unit:   "°C",
        role:   "value.temperature"
    });

    createState(STATE_DEF_ON_LOW_TEMP, {
        name:   'Default Temperatur, bei der der Pelletsofen im Heizzustand eingeschaltet wird',
        desc:   'Dieser Wert sollte nur von einem SetupScript geaendert werden',
        type:   'number',
        read:   true,
        write:  true,
        min:     0.0,
        max:    40.0,
        def:    PELLETS_ON_LOW_TEMP,
        unit:   "°C",
        role:   "value.temperature"
    });

    createState(STATE_DEF_OFF_HIGH_TEMP, {
        name:   'Default Temperatur, bei der der Pelletsofen im Absenkzustand abgeschaltet wird',
        desc:   'Dieser Wert sollte nur von einem SetupScript geaendert werden',
        type:   'number',
        read:   true,
        write:  true,
        min:     0.0,
        max:    40.0,
        def:    PELLETS_OFF_HIGH_TEMP,
        unit:   "°C",
        role:   "value.temperature"
    });

    createState(STATE_DEF_OFF_LOW_TEMP, {
        name:   'Default Temperatur, bei der der Pelletsofen im Absenkzustand eingeschaltet wird',
        desc:   'Dieser Wert sollte nur von einem SetupScript geaendert werden',
        type:   'number',
        read:   true,
        write:  true,
        min:     0.0,
        max:    40.0,
        def:    PELLETS_OFF_LOW_TEMP,
        unit:   "°C",
        role:   "value.temperature"
    });

    createState(STATE_DEF_END_HIGH_TEMP, {
        name:   'Default Temperatur, die zum Ende der Heizzeit benutzt werden soll (High)',
        desc:   'Dieser Wert sollte nur von einem SetupScript geaendert werden',
        type:   'number',
        read:   true,
        write:  true,
        min:     0.0,
        max:    40.0,
        def:    PELLETS_END_HIGH_TEMP,
        unit:   "°C",
        role:   "value.temperature"
    });

    createState(STATE_DEF_END_LOW_TEMP , {
        name:   'Default Temperatur, die zum Ende der Heizzeit benutzt werden soll (Low)',
        desc:   'Dieser Wert sollte nur von einem SetupScript geaendert werden',
        type:   'number',
        read:   true,
        write:  true,
        min:     0.0,
        max:    40.0,
        def:    PELLETS_END_LOW_TEMP,
        unit:   "°C",
        role:   "value.temperature"
    });


    createState(STATE_DEF_MIDDLE_HIGH_TEMP, {
        name:   'Default Temperatur, bei der der Ofen im MIDDLE Betrieb abgeschaltet wird',
        desc:   'Wird zur Steuerung laufend angepasst',
        type:   'number',
        read:   true,
        write:  true,
        min:     0.0,
        max:    40.0,
        def:    PELLETS_MIDDLE_HIGH_TEMP,
        unit:   "°C",
        role:   "value.temperature"
    });

    createState(STATE_DEF_MIDDLE_LOW_TEMP, {
        name:   'Default Temperatur, bei der der Pelletsofen im MIDDLE Betrieb eingeschaltet wird',
        desc:   'Wird zur Steuerung laufend angepasst',
        type:   'number',
        read:   true,
        write:  true,
        min:     0.0,
        max:    40.0,
        def:    PELLETS_MIDDLE_LOW_TEMP,
        unit:   "°C",
        role:   "value.temperature"
    });

}
