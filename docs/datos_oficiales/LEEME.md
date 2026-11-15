# Datos oficiales de referencia

`GLB.Ts+dSST.csv`: tabla oficial GISTEMP v4 (NASA GISS), medias globales tierra-océano, anomalías respecto a 1951–1980.
Descargada el 15-nov-2026 de <https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv>. Dominio público (NASA).
La usa `python -m herramientas.validar_gistemp` para comparar la pista con la serie oficial (columna `J-D`, media anual).
La tabla se actualiza cada mes: para refrescarla, `python -m herramientas.validar_gistemp --descargar`.
