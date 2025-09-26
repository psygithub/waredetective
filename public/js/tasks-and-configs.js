window.initializeSection = async () => {
    await loadConfigs();
    await loadSchedules();
    await loadConfigsForSelect();
    setupForms();
};
