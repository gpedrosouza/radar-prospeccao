@echo off
REM Executado mensalmente pela Tarefa Agendada "RadarProspeccao-GeocodeMensal".
REM Roda um lote de 10.000 geocodificacoes (dentro da cota gratuita mensal do
REM Google Geocoding API), sem restricao de UF, e registra o resultado em log.
REM Ajuste o limite abaixo se o orcamento mudar (ver conversa com Claude Code
REM sobre custo: US$ 5,00 por 1.000 chamadas acima da cota gratuita).

cd /d "C:\Users\Guilherme\Desktop\GO Dev\radar-prospeccao"

echo ============================================== >> apps\workers\geocode-monthly.log
echo %DATE% %TIME% >> apps\workers\geocode-monthly.log

call npm run geocode:cnpj --workspace=apps/workers -- 10000 >> apps\workers\geocode-monthly.log 2>&1

echo Concluido: %DATE% %TIME% >> apps\workers\geocode-monthly.log
