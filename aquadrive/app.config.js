// Preserve the existing app.json/EAS project link while enabling device themes.
module.exports=({config})=>({...config,userInterfaceStyle:'automatic',plugins:[...(config.plugins||[]),'expo-notifications']});
