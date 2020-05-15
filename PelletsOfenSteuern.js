/* Beschreibung: V0.0.4
Steuerung des Pelletsofen im Wohnzimmer nach einer Schaltzeittabelle die
in einem state im JSON Format abgespeichert ist
Die Schaltzeiten koennen durch den ical-Adapter ueberschrieben werden, wenn
im entsprechenden Kalender folgende Termine vorhanden sind:
PelletsOFF      = Temperaturprofil OFF
PelletsHIGH     = Temperaturprofil HIGH
PelletsMIDDLE   = Temperaturprofil MIDDLE
PelletsEND      = Temperaturprofil END
PelletsManu     = Temperaturprofil MANU

die einzelnen Temperaturprofile sind jeweils in einem State fuer HIG/LOW gespeichert

Aufloesungsgenauigkeit der Schaltzeitensind 15 Minuten

Umstellung Sommer/Winterbetrieb über Flag 'javascript.0.Heizung.Wohnzimmer.Pelletsofen.Season'
*/

/* ******************************************************
                   Temeratur Profile
 ********************************************************/
const PELLETS_TEMP_OFF      = "OFF";
const PELLETS_TEMP_MIDDLE   = "MIDDLE";
const PELLETS_TEMP_HIGH     = "HIGH";
const PELLETS_TEMP_END      = "END";
const PELLETS_TEMP_MANU     = "MANU";
const PELLETS_TEMP_NOT_FOUND= "NOT_FOUND";

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
const PELLETS_MANU_HIGH_TEMP    = 24.5;
const PELLETS_MANU_LOW_TEMP     =  5.0;

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
const STATE_DEF_MANU_HIGH_TEMP  = 'Heizung.Wohnzimmer.Pelletsofen.defPelletsManuHighTemp';
const STATE_DEF_MANU_LOW_TEMP   = 'Heizung.Wohnzimmer.Pelletsofen.defPelletsManuLowTemp';
/* States des ical Adapters */
const STATE_ICAL_PELLETS_OFF    = 'ical.0.events.0.now.PelletsOFF';
const STATE_ICAL_PELLETS_HIGH   = 'ical.0.events.0.now.PelletsHIGH';
const STATE_ICAL_PELLETS_MIDDLE = 'ical.0.events.0.now.PelletsMIDDLE';
const STATE_ICAL_PELLETS_END    = 'ical.0.events.0.now.PelletsEND';
const STATE_ICAL_PELLETS_MANU   = 'ical.0.events.0.now.PelletsMANU';

const STATE_SEASON              = 'javascript.0.Heizung.Wohnzimmer.Pelletsofen.Season';


/* ********************** Hauptprogramm ******************* */

/* States der homematic rausfinden, ob diese gültig sind, wird in SetTempToHomematic geprüft
wenn die Namen doppelt vorkommen, muss hier statt getIdByName der State eingetragen werden
ersichtlich im Log wird dieser fehler als ERROR ausgegeben
HMSTATE_PELLETS_TEMP_HIGH = 'hm-rega.0.xxxxx'
HMSTATE_PELLETS_TEMP_LOW  = ''hm-rega.0.yyyy' */
var hmStatePelletsTempHigh = getIdByName("PelletsTempHigh");
var hmStatePelletsTempLow  = getIdByName("PelletsTempLow");


var timerTable = null;                          // Timertabelle (Objekt) fuer Pelletsofen Schaltzeiten
var nextSchedule;
var bICALoverride  = false;      // true, wenn Kalendersteuerung aktiv

// Benoetigte States initalisieren, sofern noch nicht vorhanden
log("Pellets Timer in Startphase", 'info');
stateCreate();

setTimeout (mainStart, 10000); // Wait for states if new

/* Wird nur beim Start des Scriptes ausgeführt*/
function mainStart(){
    log("Pellets Timer gestartet", 'info');
    timeTableInit();        // Schaltzeittabelle initalisieren
    setCalendarControl();   // Check ob Events des Kalenders aktiv
    mainSchedule();         // ersten Schedule anstossen
}

/* Wird bei jedem Schedule erneut ausgefuehrt*/
function mainSchedule() {
  var o;
  //log("Schedule is called from timerTable", 'info');
  if(nextSchedule) clearSchedule(nextSchedule);
  o=scanTable(timerTable);
  if(!bICALoverride){
    setTempToHomematic(o.tempMode);
  }
  nextSchedule = schedule(o.nextSchedule ,mainSchedule);
  //log("nextSchedule = '" + o.nextSchedule + "'");
}

// Events bei Kalendersteuerung von ical Adapter
on ({id: STATE_ICAL_PELLETS_HIGH,   change: "ne" }, setCalendarControl);
on ({id: STATE_ICAL_PELLETS_MIDDLE, change: "ne" }, setCalendarControl);
on ({id: STATE_ICAL_PELLETS_END,    change: "ne" }, setCalendarControl);
on ({id: STATE_ICAL_PELLETS_OFF,    change: "ne" }, setCalendarControl);
on ({id: STATE_ICAL_PELLETS_MANU,   change: "ne" }, setCalendarControl);

on ({id: STATE_SEASON,   change: "ne" }, setSeason);

// Heizprofil Sommer Winter umstellung
function setSeason() {
  // Tabelle immer löschen, dies ist ein Workaround wegen Sommer/Winterumstellung
  // Evtl. später anders machen!!!
  setState(STATE_PELLETS_TIMER, "noData");
  setTimeout (timeTableInit, 1000);   // Timertabelle neu laden in 1000ms
  // Nächsten Schedule berechnen und anstossen
  if(nextSchedule) clearSchedule(nextSchedule);
  setTimeout(mainSchedule, 2000);
}
/* Events der Kalendersteuerung verarbeiten*/
function setCalendarControl() {
  var flag = false;                 // Ist true, wenn Schaltzeiten Override von Kalender
  var ov = PELLETS_TEMP_NOT_FOUND;    // Enthaelt das Temperaturprofil bei Kalendersteuerung

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
  } else if(getState(STATE_ICAL_PELLETS_MANU).val === true) {
    // Kalender steuert auf HIGH (Prio 4)
    ov = PELLETS_TEMP_MANU;
    flag = true;

  }

  // Flags fuer Override und Temperatur Profil setzen
  if(flag === true) {
    log("Pellets Temperatursteuerung vom Kalender aktiv! Mode: " + ov, 'info');
    setTempToHomematic(ov);
  } else {
    log("Pellets Temperatursteuerung Schaltzeittabelle aktiv!", 'info');
    setTempToHomematic(scanTable(timerTable).tempMode);
  }
  bICALoverride = flag;
}


/* scan der uebergebenen Timer Tabelle
IN:   Timertabelle
RET:  Objekt.tempMode = Gefundener Temperaturmode
      Objekt.nextSchedule = Zeitpunkt des naechsten Schedule*/
function scanTable(timerTable) {
  var today = new Date();             // Aktuelles Datum
  var weekday = today.getDay();       // Aktueller Wochentag
  var tnow = 0;                       // Aktuelle Zeit in einfachem Zahlenformat
  var ap = 0;                         // Anzahl der vorhandenen Schaltzeiten
  var foundIDX = null;                // Wenn ein Schaltzeitraum gefunden wurde dessen index
  // Object fuer Rueckgabe
  var result = {
    "tempMode": PELLETS_TEMP_NOT_FOUND , "nextSchedule": "0 0 * * *"};

  tnow = today.getHours() * 100 + today.getMinutes(); //Aktuelle Zeit in einfaches Zahlenformat umrechnen
  ap = timerTable.day[weekday].point.length;          // Anzahl der vorhandenen Schaltzeitpunke
  // Passenden Zeitabschnitt suchen (Tabelle rueckwaerts durchsuchen)
  for (r=ap-1; r >= 0 ; r--) {
      if ( timerTable.day[weekday].point[r].h *100 + timerTable.day[weekday].point[r].m <= tnow) {
          foundIDX = r;
          break;
      }
  }

  // Wenn passender Zeitabschnitt gefunden
  if(foundIDX !== null) {
      if (foundIDX < ap) {
        result.tempMode = timerTable.day[weekday].point[foundIDX].mode;
        if (foundIDX < ap-1){
          // Naechsten Schedule vorbereiten
          result.nextSchedule = timerTable.day[weekday].point[foundIDX +1].m + " " + timerTable.day[weekday].point[foundIDX +1].h +" * * *";
        }
      }
  }
  return result;
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
        case PELLETS_TEMP_MANU:
            tempHigh = getState(STATE_DEF_MANU_HIGH_TEMP).val;
            tempLow =  getState(STATE_DEF_MANU_LOW_TEMP).val;                break;
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

function timeTableInit() {
    /* Standard Heiztabelle fuer Pelletsofen generieren und in State speichern*/

    var timerTableWinter = {
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
                            {"h":  5, m: 45, "mode": PELLETS_TEMP_HIGH     },
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


// TimeTable Sommer
var timerTableSummer = {
    "day": [
        {   "name":   "Sonntag",
            "number": 0,
            "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h":  7, m: 30, "mode": PELLETS_TEMP_HIGH     },
                        {"h":  7, m: 45, "mode": PELLETS_TEMP_MANU  },
                        {"h": 10, m:  0, "mode": PELLETS_TEMP_OFF     },
                        {"h": 11, m:  0, "mode": PELLETS_TEMP_MANU      },
                        {"h": 22, m: 30, "mode": PELLETS_TEMP_OFF      }   ]   },
        {   "name":   "Montag",
            "number": 1,
            "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h":  5, m: 45, "mode": PELLETS_TEMP_HIGH     },
                        {"h":  6, m:  0, "mode": PELLETS_TEMP_MANU  },
                        {"h":  9, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h": 11, m:  0, "mode": PELLETS_TEMP_MANU     },
                        {"h": 22, m:  0, "mode": PELLETS_TEMP_OFF      }     ]   },

        {   "name":   "Dienstag",
            "number": 2,
            "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h":  5, m: 45, "mode": PELLETS_TEMP_HIGH     },
                        {"h":  6, m:  0, "mode": PELLETS_TEMP_MANU  },
                        {"h":  9, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h": 11, m:  0, "mode": PELLETS_TEMP_MANU     },
                        {"h": 22, m:  0, "mode": PELLETS_TEMP_OFF      }   ]   },

        {   "name":   "Mittwoch",
            "number": 3,
            "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h":  5, m: 45, "mode": PELLETS_TEMP_HIGH     },
                        {"h":  6, m:  0, "mode": PELLETS_TEMP_MANU  },
                        {"h":  9, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h": 11, m:  0, "mode": PELLETS_TEMP_MANU     },
                        {"h": 22, m:  0, "mode": PELLETS_TEMP_OFF      }   ]   },

        {   "name":   "Donnerstag",
            "number": 4,
            "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h":  5, m: 45, "mode": PELLETS_TEMP_HIGH     },
                        {"h":  6, m:  0, "mode": PELLETS_TEMP_MANU  },
                        {"h":  9, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h": 11, m:  0, "mode": PELLETS_TEMP_MANU     },
                        {"h": 22, m:  0, "mode": PELLETS_TEMP_OFF      }   ]   },

        {   "name":   "Freitag",
            "number": 5,
            "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h":  5, m: 45, "mode": PELLETS_TEMP_HIGH     },
                        {"h":  6, m:  0, "mode": PELLETS_TEMP_MANU  },
                        {"h":  9, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h": 11, m:  0, "mode": PELLETS_TEMP_MANU     },
                        {"h": 22, m: 30, "mode": PELLETS_TEMP_OFF      }   ]   },

        {   "name":   "Samstag",
            "number": 6,
            "point": [  {"h":  0, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h":  7, m: 30, "mode": PELLETS_TEMP_HIGH     },
                        {"h":  7, m: 45, "mode": PELLETS_TEMP_MANU  },
                        {"h": 10, m:  0, "mode": PELLETS_TEMP_OFF      },
                        {"h": 11, m:  0, "mode": PELLETS_TEMP_MANU     },
                        {"h": 22, m: 30, "mode": PELLETS_TEMP_OFF      }   ]   }


    ]
};

if(getState(STATE_SEASON).val === false) {
  timerTable = timerTableSummer;
  log("Pelletofen Wohnzimmer Timer Tabelle für Sommerbetrieb geladen");
} else {
  timerTable = timerTableWinter;
  log("Pelletofen Wohnzimmer Timer Tabelle für Winterbetrieb geladen");
}

if(getState(STATE_PELLETS_TIMER).val === "noData") {
    /* Der State mit dem JSON OBjekt ist leer dies tritt ein, wenn
    der state fuer das JSON Objekt neu erstellt wurde
    dann muss das Timer Objekt neu initalisiert werden und dann die Daten
    in den State geschrieben werden, von dort kann dann bei einem Neustart
    des Scripts die Schaltzeittabelle in das Timer Objekt eingelesen werden*/
    //pelletsTimerInit(); // State und Objekt initalisieren
    setState(STATE_PELLETS_TIMER, JSON.stringify(timerTable,(key, value) => {return value;},2));
    log("TimeTableInit: Schaltzeittabelle wurde wurde zurueck gesetzt", 'warn');
} else {
    // State mit JSON Daten ist vorhanden, dann daraus das Timer Objekt erstellen
    timerTable = JSON.parse(getState(STATE_PELLETS_TIMER).val ,(key, value) => {return value;});
    log("TimeTableInit: Timertabelle wurde aus der Datenbank geladen", 'info');
}



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

    createState(STATE_SEASON, {
        name:   'Jahreszeit Sommer oder Winter',
        type:   'boolean',
        read:   true,
        write:  true,
        def:    false,
        states: "false:Sommerbetrieb; true:Winterbetrieb"
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

    createState(STATE_DEF_MANU_HIGH_TEMP, {
        name:   'Default Temperatur, bei der der Ofen im MANU Betrieb abgeschaltet wird',
        desc:   'Wird zur Steuerung laufend angepasst',
        type:   'number',
        read:   true,
        write:  true,
        min:     0.0,
        max:    40.0,
        def:    PELLETS_MANU_HIGH_TEMP,
        unit:   "°C",
        role:   "value.temperature"
    });

    createState(STATE_DEF_MANU_LOW_TEMP, {
        name:   'Default Temperatur, bei der der Pelletsofen im MANU Betrieb eingeschaltet wird',
        desc:   'Wird zur Steuerung laufend angepasst',
        type:   'number',
        read:   true,
        write:  true,
        min:     0.0,
        max:    40.0,
        def:    PELLETS_MANU_LOW_TEMP,
        unit:   "°C",
        role:   "value.temperature"
    });

}
