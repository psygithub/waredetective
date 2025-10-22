const db = require('./db_sqlite');

async function runInventoryAnalysis(trackedSkuId = null) {
    let newAlertsCount = 0;
    const configs = db.getSystemConfigs();
    const timespan = parseInt(configs.alert_timespan || '7', 10);
    const threshold = parseFloat(configs.alert_threshold || '0.5');
    const minDailyConsumption = parseFloat(configs.alert_min_daily_consumption || '1');

    let skusToAnalyze;
    if (trackedSkuId) {
        console.log(`开始为单个SKU (ID: ${trackedSkuId}) 执行库存消耗分析...`);
        const singleSku = db.getTrackedSkuById(trackedSkuId);
        skusToAnalyze = singleSku ? [singleSku] : [];
    } else {
        console.log('开始为所有SKU执行库存消耗分析...');
        skusToAnalyze = db.getTrackedSkus();
    }

    for (const sku of skusToAnalyze) {
        const history = db.getRegionalInventoryHistoryForSku(sku.id, timespan);
        
        // 按区域分组
        const historyByRegion = history.reduce((acc, record) => {
            if (!acc[record.region_id]) {
                acc[record.region_id] = [];
            }
            acc[record.region_id].push(record);
            return acc;
        }, {});

        for (const regionId in historyByRegion) {
            const regionHistory = historyByRegion[regionId];
            if (regionHistory.length < 2) continue;

            // 简单线性回归分析消耗速度
            const firstRecord = regionHistory[0];
            const lastRecord = regionHistory[regionHistory.length - 1];
            
            const qtyChange = firstRecord.qty - lastRecord.qty;
            const days = (new Date(lastRecord.record_date) - new Date(firstRecord.record_date)) / (1000 * 60 * 60 * 24);

            if (days > 0 && qtyChange > 0) {
                const consumptionRate = (qtyChange / firstRecord.qty) / days;
                const dailyConsumption = qtyChange / days;

                if (consumptionRate > threshold && dailyConsumption > minDailyConsumption) {
                    const alertDetails = {
                        timespan,
                        threshold,
                        minDailyConsumption,
                        consumptionRate,
                        dailyConsumption,
                        qtyChange,
                        days,
                        startQty: firstRecord.qty,
                        endQty: lastRecord.qty,
                    };
                    db.createAlert({
                        tracked_sku_id: sku.id,
                        sku: sku.sku,
                        region_id: regionId,
                        region_name: firstRecord.region_name,
                        alert_type: 'FAST_CONSUMPTION',
                        details: JSON.stringify(alertDetails),
                    });
                    newAlertsCount++;
                    console.log(`预警: SKU ${sku.sku} 在 ${firstRecord.region_name} 消耗过快! 日均消耗率: ${consumptionRate.toFixed(3)}, 日均消耗量: ${dailyConsumption.toFixed(2)}`);
                }
            }
        }
    }
    console.log('库存消耗分析完成。');
    return { newAlertsCount };
}

module.exports = {
    runInventoryAnalysis,
};
