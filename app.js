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
  var sortState = {
    key: "deviceName",
    dir: "asc"
  };
  var lastRows = [];
  var expandedByDeviceId = {};

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
    updateSortHeaders();
    els.tbody.innerHTML = "";

    if (!rows.length) {
      els.empty.style.display = "block";
      return;
    }

    els.empty.style.display = "none";

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.className = "main-row";
      tr.setAttribute("data-device-id", row.deviceId || "");

      tr.innerHTML = [
        "<td class=\"device-cell\">" + escapeHtml(row.deviceName) + "</td>",
        "<td>" + escapeHtml(row.sourceLabel) + "</td>",
        "<td>" + escapeHtml(row.measurementLabel) + "</td>",
        "<td class=\"num\">" + row.tripCount + "</td>",
        "<td class=\"num\">" + row.totalKm.toFixed(1) + "</td>",
        "<td class=\"num\">" + row.activationCount + "</td>"
      ].join("");

      tr.addEventListener("click", function () {
        toggleExpanded(row.deviceId);
      });
      els.tbody.appendChild(tr);

      if (expandedByDeviceId[row.deviceId]) {
        els.tbody.appendChild(createTripDetailsRow(row));
      }
    });
  }

  function toggleExpanded(deviceId) {
    if (!deviceId) {
      return;
    }
    expandedByDeviceId[deviceId] = !expandedByDeviceId[deviceId];
    renderRows(applySort(lastRows));
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleString("es-ES");
  }

  function toLocalDayKey(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function buildDailyTripSummary(trips) {
    var map = {};

    (trips || []).forEach(function (trip) {
      var baseDate = trip.start || trip.stop;
      var dayKey = toLocalDayKey(baseDate);
      if (!dayKey) {
        return;
      }
      if (!map[dayKey]) {
        map[dayKey] = {
          dayKey: dayKey,
          start: trip.start || trip.stop || null,
          stop: trip.stop || trip.start || null,
          distanceKm: 0,
          activationCount: 0
        };
      }

      if (trip.start && (!map[dayKey].start || new Date(trip.start) < new Date(map[dayKey].start))) {
        map[dayKey].start = trip.start;
      }
      if (trip.stop && (!map[dayKey].stop || new Date(trip.stop) > new Date(map[dayKey].stop))) {
        map[dayKey].stop = trip.stop;
      }

      map[dayKey].distanceKm += Number(trip.distanceKm || 0);
      map[dayKey].activationCount += Number(trip.activationCount || 0);
    });

    return Object.keys(map)
      .map(function (key) {
        return map[key];
      })
      .sort(function (a, b) {
        return new Date(b.dayKey) - new Date(a.dayKey);
      });
  }

  function createTripDetailsRow(row) {
    var detailTr = document.createElement("tr");
    detailTr.className = "detail-row";
    var detailTd = document.createElement("td");
    detailTd.colSpan = 6;

    if (!row.trips || !row.trips.length) {
      detailTd.innerHTML = "<div class=\"detail-empty\">Sin viajes en el rango seleccionado.</div>";
      detailTr.appendChild(detailTd);
      return detailTr;
    }

    var lines = [];
    var dailyRows = buildDailyTripSummary(row.trips);
    lines.push("<div class=\"detail-wrap\">");
    lines.push("<div class=\"detail-title\">Viajes por dia de " + escapeHtml(row.deviceName) + " (" + dailyRows.length + " dia(s))</div>");
    lines.push("<table class=\"detail-table\">");
    lines.push("<thead><tr><th>Inicio</th><th>Fin</th><th>Km</th><th>Activaciones</th></tr></thead>");
    lines.push("<tbody>");

    dailyRows.forEach(function (trip) {
      lines.push(
        "<tr>" +
          "<td>" + escapeHtml(formatDateTime(trip.start)) + "</td>" +
          "<td>" + escapeHtml(formatDateTime(trip.stop)) + "</td>" +
          "<td class=\"num\">" + Number(trip.distanceKm || 0).toFixed(1) + "</td>" +
          "<td class=\"num\">" + Number(trip.activationCount || 0) + "</td>" +
        "</tr>"
      );
    });

    lines.push("</tbody></table></div>");
    detailTd.innerHTML = lines.join("");
    detailTr.appendChild(detailTd);
    return detailTr;
  }

  function applySort(rows) {
    var sorted = (rows || []).slice();
    var key = sortState.key;
    var dirMul = sortState.dir === "asc" ? 1 : -1;

    sorted.sort(function (a, b) {
      if (key === "deviceName") {
        return dirMul * String(a.deviceName || "").localeCompare(String(b.deviceName || ""), "es", { sensitivity: "base" });
      }
      if (key === "tripCount") {
        return dirMul * (Number(a.tripCount || 0) - Number(b.tripCount || 0));
      }
      if (key === "activationCount") {
        return dirMul * (Number(a.activationCount || 0) - Number(b.activationCount || 0));
      }
      return 0;
    });

    return sorted;
  }

  function updateSortHeaders() {
    var sortableHeaders = document.querySelectorAll("th.sortable");
    sortableHeaders.forEach(function (th) {
      var key = th.getAttribute("data-sort-key");
      if (key === sortState.key) {
        th.setAttribute("data-sort-dir", sortState.dir);
      } else {
        th.removeAttribute("data-sort-dir");
      }
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

  function ensureStylesheet() {
    var styleId = "toma-fuerza-stylesheet";
    if (document.getElementById(styleId)) {
      return;
    }
    var link = document.createElement("link");
    link.id = styleId;
    link.rel = "stylesheet";
    link.href = "styles.css";
    document.head.appendChild(link);
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
    var normalizedTrips = (trips || []).map(function (trip) {
      return {
        start: trip.start,
        stop: trip.stop,
        distanceKm: Number(trip.distance || 0),
        activationCount: 0
      };
    });

    return {
      tripCount: (trips || []).length,
      totalKm: totalKm,
      trips: normalizedTrips
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

  function countActivationsInRows(rows, expectedOnValue) {
    var ordered = (rows || []).slice().sort(function (a, b) {
      return new Date(a.dateTime) - new Date(b.dateTime);
    });
    var prev = false;
    var count = 0;
    var times = [];
    ordered.forEach(function (row) {
      var current = isOnValue(row.data, expectedOnValue);
      if (current && !prev) {
        count += 1;
        times.push(row.dateTime);
      }
      prev = current;
    });
    return {
      count: count,
      times: times
    };
  }

  async function buildActivationIndex(deviceIds, measurementDefs, fromDate, toDate) {
    var allowed = {};
    var activationIndex = {};

    (deviceIds || []).forEach(function (id) {
      allowed[id] = true;
      activationIndex[id] = {
        total: 0,
        measurementLabel: "-",
        byKey: {}
      };
    });

    for (var i = 0; i < measurementDefs.length; i += 1) {
      var measurement = measurementDefs[i];
      var diagnostics = dedupeDiagnostics(measurement.diagnostics);
      var measurementCountByDevice = {};
      var measurementTimesByDevice = {};

      for (var j = 0; j < diagnostics.length; j += 1) {
        var diagnostic = diagnostics[j];
        var statusData = await callApi("Get", {
          typeName: "StatusData",
          search: {
            diagnosticSearch: { id: getId(diagnostic.id) },
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString()
          }
        });

        var rowsByDevice = {};
        (statusData || []).forEach(function (row) {
          var rowDeviceId = getId(row.device);
          if (!rowDeviceId || !allowed[rowDeviceId]) {
            return;
          }
          if (!rowsByDevice[rowDeviceId]) {
            rowsByDevice[rowDeviceId] = [];
          }
          rowsByDevice[rowDeviceId].push(row);
        });

        Object.keys(rowsByDevice).forEach(function (deviceId) {
          var activationData = countActivationsInRows(rowsByDevice[deviceId], measurement.onValue);
          measurementCountByDevice[deviceId] = (measurementCountByDevice[deviceId] || 0) + activationData.count;
          if (!measurementTimesByDevice[deviceId]) {
            measurementTimesByDevice[deviceId] = [];
          }
          measurementTimesByDevice[deviceId] = measurementTimesByDevice[deviceId].concat(activationData.times);
        });
      }

      Object.keys(allowed).forEach(function (deviceId) {
        var count = measurementCountByDevice[deviceId] || 0;
        activationIndex[deviceId].byKey[measurement.key] = {
          label: measurement.label,
          count: count
        };
        if (!activationIndex[deviceId].activationTimes) {
          activationIndex[deviceId].activationTimes = [];
        }
        if (measurementTimesByDevice[deviceId] && measurementTimesByDevice[deviceId].length) {
          activationIndex[deviceId].activationTimes = activationIndex[deviceId].activationTimes.concat(measurementTimesByDevice[deviceId]);
        }
      });
    }

    Object.keys(allowed).forEach(function (deviceId) {
      var byKey = activationIndex[deviceId].byKey;
      var matches = Object.keys(byKey).map(function (key) {
        return {
          key: key,
          label: byKey[key].label,
          count: byKey[key].count
        };
      });
      var total = matches.reduce(function (sum, m) {
        return sum + m.count;
      }, 0);
      var sortedTimes = (activationIndex[deviceId].activationTimes || []).slice().sort(function (a, b) {
        return new Date(a) - new Date(b);
      });
      activationIndex[deviceId].total = total;
      activationIndex[deviceId].measurementLabel = formatMeasurementLabel(matches);
      activationIndex[deviceId].activationTimes = sortedTimes;
    });

    return activationIndex;
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
      var candidateDeviceIds = candidateDevices.map(function (row) {
        return getId(row.device.id);
      }).filter(function (id) {
        return !!id;
      });

      setStatus("Cargando mediciones de activación...");
      var measurementDefs = await getMeasurementDiagnostics();
      var hasAnyDiagnostic = measurementDefs.some(function (m) {
        return m.diagnostics && m.diagnostics.length > 0;
      });
      if (!hasAnyDiagnostic) {
        throw new Error("No se encontraron diagnósticos para 'Toma de fuerza activada' ni 'Auxiliar 1'.");
      }

      setStatus("Agrupando activaciones por unidad...");
      var activationIndex = await buildActivationIndex(candidateDeviceIds, measurementDefs, range.fromDate, range.toDate);

      setStatus("Calculando viajes, km y activaciones...");
      var rows = await mapLimit(candidateDevices, 2, async function (row) {
        var device = row.device;
        var dType = row.type;
        var deviceId = getId(device.id);

        var tripSummary = await getTripsForDevice(deviceId, range.fromDate, range.toDate);
        var activationResult = activationIndex[deviceId] || { total: 0, measurementLabel: "-" };
        var activationTimes = activationResult.activationTimes || [];
        var tripsWithActivations = tripSummary.trips.map(function (trip) {
          var startMs = new Date(trip.start).getTime();
          var stopMs = new Date(trip.stop).getTime();
          var count = 0;
          if (!Number.isNaN(startMs) && !Number.isNaN(stopMs)) {
            activationTimes.forEach(function (time) {
              var eventMs = new Date(time).getTime();
              if (!Number.isNaN(eventMs) && eventMs >= startMs && eventMs <= stopMs) {
                count += 1;
              }
            });
          }
          return {
            start: trip.start,
            stop: trip.stop,
            distanceKm: trip.distanceKm,
            activationCount: count
          };
        });

        return {
          deviceId: deviceId,
          deviceName: device.name || "(sin nombre)",
          sourceLabel: sourceLabel(dType),
          measurementLabel: activationResult.measurementLabel,
          tripCount: tripSummary.tripCount,
          totalKm: tripSummary.totalKm,
          activationCount: activationResult.total,
          trips: tripsWithActivations
        };
      });

      rows = rows
        .filter(function (row) {
          return row.totalKm >= minKm;
        });
      lastRows = rows;
      expandedByDeviceId = {};
      renderRows(applySort(lastRows));
      setStatus("Resultado: " + lastRows.length + " unidad(es).", false);
    } catch (error) {
      lastRows = [];
      expandedByDeviceId = {};
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
    ensureStylesheet();

    els.startDate = document.getElementById("startDate");
    els.endDate = document.getElementById("endDate");
    els.sourceFilter = document.getElementById("sourceFilter");
    els.minKm = document.getElementById("minKm");
    els.refreshBtn = document.getElementById("refreshBtn");
    els.tbody = document.getElementById("tbody");
    els.empty = document.getElementById("empty");
    els.status = document.getElementById("status");
    els.sortableHeaders = document.querySelectorAll("th.sortable");

    setDefaultDates();

    els.sortableHeaders.forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort-key");
        if (!key) {
          return;
        }
        if (sortState.key === key) {
          sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
          sortState.key = key;
          sortState.dir = key === "deviceName" ? "asc" : "desc";
        }
        renderRows(applySort(lastRows));
      });
    });

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
