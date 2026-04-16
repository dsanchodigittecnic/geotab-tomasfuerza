(function () {
  "use strict";

  var GROUP_AUX_NAME = "toma de fuerza por aux";
  var GROUP_FMS_NAME = "toma de fuerza por fms";
  var MEASUREMENT_TDF = {
    key: "tdf",
    label: "Toma de fuerza activada",
    diagnosticName: "toma de fuerza activada",
    onValue: "1. activado"
  };
  var MEASUREMENT_AUX1 = {
    key: "aux1",
    label: "Auxiliar 1",
    diagnosticName: "auxiliar 1",
    onValue: "1. en"
  };

  var els = {};
  var apiRef = null;

  function getId(ref) {
    if (!ref) {
      return "";
    }
    if (typeof ref === "string") {
      return ref;
    }
    return ref.id || "";
  }

  function normalize(text) {
    return String(text || "").trim().toLowerCase();
  }

  function toInputDate(date) {
    var d = new Date(date);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function parseDateRange(startDateValue, endDateValue) {
    var fromDate = new Date(startDateValue + "T00:00:00");
    var toDate = new Date(endDateValue + "T23:59:59");
    return {
      fromDate: fromDate,
      toDate: toDate
    };
  }

  function setStatus(message, isError) {
    els.status.textContent = message || "";
    els.status.className = isError ? "status error" : "status";
  }

  function setLoading(isLoading) {
    els.refreshBtn.disabled = isLoading;
    if (isLoading) {
      setStatus("Cargando datos...");
    }
  }

  function renderRows(rows) {
    els.tbody.innerHTML = "";

    if (!rows.length) {
      els.empty.style.display = "block";
      return;
    }

    els.empty.style.display = "none";

    rows.forEach(function (row) {
      var tr = document.createElement("tr");

      tr.innerHTML = [
        "<td>" + escapeHtml(row.deviceName) + "</td>",
        "<td>" + escapeHtml(row.sourceLabel) + "</td>",
        "<td>" + escapeHtml(row.measurementLabel) + "</td>",
        "<td class=\"num\">" + row.tripCount + "</td>",
        "<td class=\"num\">" + row.totalKm.toFixed(1) + "</td>",
        "<td class=\"num\">" + row.activationCount + "</td>"
      ].join("");

      els.tbody.appendChild(tr);
    });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function callApi(method, params) {
    return new Promise(function (resolve, reject) {
      apiRef.call(method, params, resolve, reject);
    });
  }

  function toNumberValue(value) {
    if (typeof value === "number") {
      return value;
    }
    var str = normalize(value);
    var num = Number(str);
    return Number.isNaN(num) ? null : num;
  }

  function mapLimit(items, limit, mapper) {
    var index = 0;
    var active = 0;
    var results = new Array(items.length);

    return new Promise(function (resolve, reject) {
      function launchNext() {
        if (index >= items.length && active === 0) {
          resolve(results);
          return;
        }

        while (active < limit && index < items.length) {
          (function (current) {
            active += 1;
            Promise.resolve()
              .then(function () {
                return mapper(items[current], current);
              })
              .then(function (result) {
                results[current] = result;
                active -= 1;
                launchNext();
              })
              .catch(function (error) {
                reject(error);
              });
          })(index);

          index += 1;
        }
      }

      launchNext();
    });
  }

  function buildGroupTypeMap(groups, auxRootIds, fmsRootIds) {
    var mapById = {};
    groups.forEach(function (g) {
      mapById[getId(g.id)] = g;
    });

    var memo = {};

    function evalType(groupId, stackGuard) {
      if (!groupId) {
        return { aux: false, fms: false };
      }

      if (memo[groupId]) {
        return memo[groupId];
      }

      if (stackGuard[groupId]) {
        return { aux: false, fms: false };
      }

      stackGuard[groupId] = true;

      var out = {
        aux: auxRootIds.has(groupId),
        fms: fmsRootIds.has(groupId)
      };

      var group = mapById[groupId];
      if (group) {
        var parentId = getId(group.parent);
        if (parentId && parentId !== groupId) {
          var parentType = evalType(parentId, stackGuard);
          out.aux = out.aux || parentType.aux;
          out.fms = out.fms || parentType.fms;
        }
      }

      memo[groupId] = out;
      delete stackGuard[groupId];
      return out;
    }

    var result = {};
    groups.forEach(function (g) {
      var id = getId(g.id);
      result[id] = evalType(id, {});
    });
    return result;
  }

  function getDeviceGroupType(device, groupTypeMap) {
    var out = { aux: false, fms: false };
    (device.groups || []).forEach(function (groupRef) {
      var id = getId(groupRef);
      var t = groupTypeMap[id];
      if (t) {
        out.aux = out.aux || t.aux;
        out.fms = out.fms || t.fms;
      }
    });
    return out;
  }

  function passesSourceFilter(deviceType, sourceFilter) {
    if (sourceFilter === "aux") {
      return deviceType.aux;
    }
    if (sourceFilter === "fms") {
      return deviceType.fms;
    }
    return deviceType.aux || deviceType.fms;
  }

  function sourceLabel(deviceType) {
    if (deviceType.aux && deviceType.fms) {
      return "AUX + FMS";
    }
    if (deviceType.aux) {
      return "AUX";
    }
    if (deviceType.fms) {
      return "FMS";
    }
    return "-";
  }

  async function getTripsForDevice(deviceId, fromDate, toDate) {
    var trips = await callApi("Get", {
      typeName: "Trip",
      search: {
        deviceSearch: { id: deviceId },
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString()
      }
    });

    var totalKm = (trips || []).reduce(function (sum, trip) {
      var distance = Number(trip.distance || 0);
      return sum + distance;
    }, 0);

    return {
      tripCount: (trips || []).length,
      totalKm: totalKm
    };
  }

  function findDiagnosticsByName(allDiagnostics, diagnosticName) {
    var expected = normalize(diagnosticName);
    return (allDiagnostics || []).filter(function (d) {
      var name = normalize(d && d.name);
      return !!name && name.indexOf(expected) >= 0;
    });
  }

  async function getMeasurementDiagnostics() {
    var allDiagnostics = await callApi("Get", {
      typeName: "Diagnostic",
      search: {}
    });

    var tdfDiagnostics = findDiagnosticsByName(allDiagnostics, MEASUREMENT_TDF.diagnosticName);
    var aux1Diagnostics = findDiagnosticsByName(allDiagnostics, MEASUREMENT_AUX1.diagnosticName);

    return [
      {
        key: MEASUREMENT_TDF.key,
        label: MEASUREMENT_TDF.label,
        onValue: MEASUREMENT_TDF.onValue,
        diagnostics: tdfDiagnostics
      },
      {
        key: MEASUREMENT_AUX1.key,
        label: MEASUREMENT_AUX1.label,
        onValue: MEASUREMENT_AUX1.onValue,
        diagnostics: aux1Diagnostics
      }
    ];
  }

  function formatMeasurementLabel(matches) {
    var used = matches.filter(function (m) {
      return m.count > 0;
    }).map(function (m) {
      return m.label;
    });

    if (!used.length) {
      return "-";
    }
    return used.join(" + ");
  }

  function isOnValue(dataValue, expectedOnValue) {
    var normalizedData = normalize(dataValue);
    if (!normalizedData) {
      return false;
    }
    if (normalizedData === normalize(expectedOnValue)) {
      return true;
    }
    var numericValue = toNumberValue(dataValue);
    return numericValue === 1;
  }

  function dedupeDiagnostics(diagnostics) {
    var seen = {};
    return (diagnostics || []).filter(function (d) {
      var id = getId(d.id);
      if (!id || seen[id]) {
        return false;
      }
      seen[id] = true;
      return true;
    });
  }

  async function countActivationsByMeasurement(deviceId, measurementDefs, fromDate, toDate) {
    var matches = [];

    for (var i = 0; i < measurementDefs.length; i += 1) {
      var measurement = measurementDefs[i];
      var diagnostics = dedupeDiagnostics(measurement.diagnostics);
      var count = 0;

      for (var j = 0; j < diagnostics.length; j += 1) {
        var diagnostic = diagnostics[j];
        var statusData = await callApi("Get", {
          typeName: "StatusData",
          search: {
            deviceSearch: { id: deviceId },
            diagnosticSearch: { id: getId(diagnostic.id) },
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString()
          }
        });

        var ordered = (statusData || []).slice().sort(function (a, b) {
          return new Date(a.dateTime) - new Date(b.dateTime);
        });

        var prev = false;
        ordered.forEach(function (row) {
          var current = isOnValue(row.data, measurement.onValue);
          if (current && !prev) {
            count += 1;
          }
          prev = current;
        });
      }

      matches.push({
        key: measurement.key,
        label: measurement.label,
        count: count
      });
    }

    var total = matches.reduce(function (sum, m) {
      return sum + m.count;
    }, 0);

    return {
      total: total,
      measurementLabel: formatMeasurementLabel(matches)
    };
  }

  async function loadReport() {
    setLoading(true);

    try {
      var startDate = els.startDate.value;
      var endDate = els.endDate.value;
      var sourceFilter = els.sourceFilter.value;
      var minKm = Number(els.minKm.value || 0);

      if (!startDate || !endDate) {
        throw new Error("Selecciona fecha de inicio y fin.");
      }

      if (new Date(startDate) > new Date(endDate)) {
        throw new Error("La fecha de inicio no puede ser mayor a la fecha fin.");
      }

      var range = parseDateRange(startDate, endDate);
      setStatus("Buscando grupos y unidades...");

      var groups = await callApi("Get", {
        typeName: "Group",
        search: {}
      });

      var auxRoots = (groups || []).filter(function (g) {
        return normalize(g.name) === GROUP_AUX_NAME;
      });
      var fmsRoots = (groups || []).filter(function (g) {
        return normalize(g.name) === GROUP_FMS_NAME;
      });

      if (!auxRoots.length && !fmsRoots.length) {
        throw new Error("No se encontraron grupos 'toma de fuerza por AUX' o 'toma de fuerza por FMS'.");
      }

      var auxRootIds = new Set(auxRoots.map(function (g) { return getId(g.id); }));
      var fmsRootIds = new Set(fmsRoots.map(function (g) { return getId(g.id); }));
      var groupTypeMap = buildGroupTypeMap(groups || [], auxRootIds, fmsRootIds);

      var devices = await callApi("Get", {
        typeName: "Device",
        search: {}
      });

      var candidateDevices = (devices || []).map(function (d) {
        var dType = getDeviceGroupType(d, groupTypeMap);
        return {
          device: d,
          type: dType
        };
      }).filter(function (row) {
        return passesSourceFilter(row.type, sourceFilter);
      });

      setStatus("Cargando mediciones de activación...");
      var measurementDefs = await getMeasurementDiagnostics();
      var hasAnyDiagnostic = measurementDefs.some(function (m) {
        return m.diagnostics && m.diagnostics.length > 0;
      });
      if (!hasAnyDiagnostic) {
        throw new Error("No se encontraron diagnósticos para 'Toma de fuerza activada' ni 'Auxiliar 1'.");
      }

      setStatus("Calculando viajes, km y activaciones...");
      var rows = await mapLimit(candidateDevices, 4, async function (row) {
        var device = row.device;
        var dType = row.type;

        var tripSummary = await getTripsForDevice(getId(device.id), range.fromDate, range.toDate);
        var activationResult = await countActivationsByMeasurement(getId(device.id), measurementDefs, range.fromDate, range.toDate);

        return {
          deviceName: device.name || "(sin nombre)",
          sourceLabel: sourceLabel(dType),
          measurementLabel: activationResult.measurementLabel,
          tripCount: tripSummary.tripCount,
          totalKm: tripSummary.totalKm,
          activationCount: activationResult.total
        };
      });

      rows = rows
        .filter(function (row) {
          return row.totalKm >= minKm;
        })
        .sort(function (a, b) {
          return b.totalKm - a.totalKm;
        });

      renderRows(rows);
      setStatus("Resultado: " + rows.length + " unidad(es).", false);
    } catch (error) {
      renderRows([]);
      setStatus(error && error.message ? error.message : "Error al cargar la información.", true);
    } finally {
      setLoading(false);
    }
  }

  function setDefaultDates() {
    var today = new Date();
    var from = new Date(today);
    from.setDate(today.getDate() - 30);

    els.startDate.value = toInputDate(from);
    els.endDate.value = toInputDate(today);
  }

  function initUi(api) {
    apiRef = api;

    els.startDate = document.getElementById("startDate");
    els.endDate = document.getElementById("endDate");
    els.sourceFilter = document.getElementById("sourceFilter");
    els.minKm = document.getElementById("minKm");
    els.refreshBtn = document.getElementById("refreshBtn");
    els.tbody = document.getElementById("tbody");
    els.empty = document.getElementById("empty");
    els.status = document.getElementById("status");

    setDefaultDates();

    els.refreshBtn.addEventListener("click", function () {
      loadReport();
    });
  }

  geotab.addin.tomaFuerzaReport = function (api) {
    return {
      initialize: function (freshApi, freshState, initializeCallback) {
        initUi(freshApi || api);
        initializeCallback();
      },
      focus: function () {
        loadReport();
      },
      blur: function () {}
    };
  };
})();
