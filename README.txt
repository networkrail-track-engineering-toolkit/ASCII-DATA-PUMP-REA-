ASCII Data Pump (HTML replacement)

Start the app
1. Double-click "Start ASCII Data Pump.bat".
2. Keep the command window open while using the app.
3. Connect to the Network Rail corporate network or VPN so the internal WEBQUERY service is reachable.
4. Choose the ELR, track ID, eighth range, and survey date. Use "Load tracks" and "Load dates" to refresh valid values.
5. Select "Extract data and export". Choose where to save the tab-delimited .txt file.

The app runs its web interface and a small request proxy on this computer only
(127.0.0.1:8765). It sends the same workbook parameters to the internal
http://cdds.corp.ukrail.net/WEBQUERY/WEBQUERY service. No package installation
is required. If live option lists are unavailable, enter the values manually;
the live data service is still required for extraction.

The export retains the workbook's 18 columns, units row, first-line request
summary, and tab-delimited text layout. The app preview displays at most 100
rows; the saved file contains all returned samples.
