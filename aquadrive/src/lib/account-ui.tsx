import {Pressable,Text,View} from 'react-native';
import {Icon,IconName} from './brand';
import {useStyles} from './ui';
export function AccountRow({title,detail,icon='arrow',onPress}:{title:string;detail?:string;icon?:IconName;onPress:()=>void}){const s=useStyles();return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{flexDirection:'row',alignItems:'center',gap:16,paddingVertical:20,borderBottomWidth:1,borderBottomColor:s.input.borderColor,minHeight:64}}><Icon name={icon} color={s.body.color}/><View style={{flex:1}}><Text style={[s.subtitle,{marginBottom:detail?5:0}]}>{title}</Text>{detail&&<Text style={s.small}>{detail}</Text>}</View><Text style={s.small}>›</Text></Pressable>;}
