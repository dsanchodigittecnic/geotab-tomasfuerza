# Add-in Geotab - Reporte Toma de Fuerza

Este add-in muestra una tabla con:
- Nombre de unidad
- Medicion (Toma de fuerza activada, Auxiliar 1 o ambas)
- Numero de viajes
- Km total
- Numero de activaciones
- Despliegue de detalle de viajes agrupados por dia (inicio, fin, km y activaciones) al hacer clic en la unidad

Filtros incluidos:
- Fecha inicio/fin
- Tipo de toma de fuerza: Todos (por defecto), AUX, FMS
- Minimo de km en viajes

## Archivos
- `manifest.json`
- `index.html`
- `styles.css`
- `app.js`

## Configuracion importante
En `app.js` puedes ajustar estos valores si en tu base los nombres cambian:
- `GROUP_AUX_NAME`
- `GROUP_FMS_NAME`
- `MEASUREMENT_TDF.diagnosticName`
- `MEASUREMENT_AUX1.diagnosticName`

## Como calcula activaciones
Cuenta una activacion cuando el valor de `StatusData` pasa de apagado a encendido en:
- `Toma de fuerza activada` cuando el dato es `1. Activado`
- `Auxiliar 1` cuando el dato es `1. En`

## Despliegue
1. Publica los archivos en un hosting accesible por MyGeotab.
2. Registra el add-in en Marketplace/SDK de Geotab usando el `manifest.json`.
3. Abre el add-in en Geotab y aplica filtros.

