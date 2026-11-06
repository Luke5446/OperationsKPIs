/* standard-costs.sql — Sage standard cost £ per garment for the Operations KPIs dashboard.
   Run in SQL 1.xlsx against TIB-SQL-002. One row per stock code made in-house, across both
   companies: OH codes from OliverHarveyLive, everything else from S200_LIVE.

   Copy the JsonLine column (all rows) and paste it between the { } of "costs" in
   data/standard-costs.json, then set "_updated" to today's date and push the file.
   The last line's trailing comma must be removed (JSON does not allow it).

   StandardCost is the Sage 200 stock item standard cost. If your Sage build keeps it on another
   column, change the two SC lines marked <<. Codes with a zero standard cost are left out, so the
   dashboard lists them as unpriced rather than counting them at £0. */
;WITH Costs AS (
    SELECT  'Tibard'                                 AS Company,
            si.Code,
            si.Name,
            pg.Code                                  AS ProductGroup,
            CAST(si.StandardCost AS DECIMAL(18,4))   AS StdCost      -- <<
    FROM    S200_LIVE.dbo.StockItem si
    LEFT JOIN S200_LIVE.dbo.ProductGroup pg ON pg.ProductGroupID = si.ProductGroupID
    WHERE   si.Code NOT LIKE 'OH%'
    UNION ALL
    SELECT  'OH',
            si.Code,
            si.Name,
            pg.Code,
            CAST(si.StandardCost AS DECIMAL(18,4))                   -- <<
    FROM    OliverHarveyLive.dbo.StockItem si
    LEFT JOIN OliverHarveyLive.dbo.ProductGroup pg ON pg.ProductGroupID = si.ProductGroupID
    WHERE   si.Code LIKE 'OH%'
)
SELECT  Company,
        Code,
        Name,
        ProductGroup,
        StdCost,
        '"' + UPPER(RTRIM(Code)) + '": ' + CONVERT(VARCHAR(20), StdCost) + ','   AS JsonLine
FROM    Costs
WHERE   StdCost > 0
  AND   Code NOT LIKE 'BULK%'          -- Clockwork bulk codes are bought in, not made
ORDER BY Company, Code;
