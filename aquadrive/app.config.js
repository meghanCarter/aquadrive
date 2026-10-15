// Preserve the existing app.json/EAS project link while enabling device themes.
module.exports=({config})=>({...config,userInterfaceStyle:'automatic',android:{...config.android,googleServicesFile:'./google-services.json'},plugins:[...(config.plugins||[]),'expo-notifications']});
