shader_type canvas_item;


uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_nearest;

uniform vec4 color: source_color = vec4(0.,0.5,1.0,1.0);
//uniform float amplitude : hint_range(0., 2., 0.01) = 2.;
uniform float frequency : hint_range(0., 1000. , 1.) = 3.;
uniform float compress : hint_range(1., 2. , 0.01) = 1.;
uniform float add_light : hint_range(0., 2. , 0.01) = 0.;

uniform float scale : hint_range(0., 2. , 0.01) = 1.;
uniform float speed : hint_range(-1000., 1000. , 0.01) = 1.;
uniform float x_angle: hint_range(-1.57, 1.57, 0.01) = 1.57;
uniform float y_angle: hint_range(-1.57, 1.57, 0.01) = 1.57;
uniform float base_alpha : hint_range(-2., 2. , 0.01) = 0.8;
uniform float refraction_ratio: hint_range(-100, 100, 0.01) = 10.;//0.2;
uniform float clear : hint_range(0., 1. , 0.01) = 0.;

uniform float surf_sinpowder : hint_range(0., 8. , 1.) = 8.;
uniform float surf_speed : hint_range(-10., 10. , 0.01) = 1.;
uniform float surf_angle : hint_range(-1.57, 1.57, 0.01) = 1.57;
uniform float surf_magnitude : hint_range(0., 10. , 0.01) = 0.;

uniform float s11: hint_range(-10, 10, 0.01) = 2.221;
uniform float sinpowder : hint_range(0., 8. , 1.) = 8.;

vec2 UVtoSreenUV(vec2 uv, bool is_camera_center, vec2 texture_pixel_size, vec2 screen_pixel_size, vec4 fragcoord) {

	vec2 suv = (uv - 0.5)*2.;

	if (is_camera_center) {

		return (fragcoord.xy + suv*0.01/texture_pixel_size)*screen_pixel_size*0.5;
	} else {

		return (fragcoord.xy + suv*0.01/texture_pixel_size)*screen_pixel_size;
	}
}

vec2 shiftuv2(vec2 uv, float shiftratio) {

	vec2 suv = (uv - 0.5)*2.;

	return (suv + suv*-1.*shiftratio)*0.5 + 0.5;
}

float yget(float x,float fc1,float fc2,float fc3,float fc4,float tc1,float tc2,float tc3,float tc4,float amc1,float amc2,float amc3,float amc4,float way,float addt) {

	float t = speed*TIME*way + addt;
	float y = sin(x * frequency);

	y += pow(abs(sin(x*frequency*fc1 + t*tc1)),sinpowder)*amc1;
	y += pow(abs(sin(x*frequency*fc2 + t*tc2)),sinpowder)*amc2;
	y += pow(abs(sin(x*frequency*fc3 + t*tc3)),sinpowder)*amc3;
	y += pow(abs(sin(x*frequency*fc4 + t*tc4)),sinpowder)*amc4;
	y /= (amc1+amc2+amc3+amc4);

	return y;
}

void fragment(){

	vec2 st = (UV-0.5)*2.*scale;

	float dl = distance(vec2(0.), vec2(dFdx(st.x), dFdy(st.y)));

	vec2 st2 = ((UV-0.5)*2. + dl)*scale;

	float x = st.x;
	float y = st.y;

	float adda = pow(abs(sin(surf_speed*TIME*scale + x*sin(surf_angle) + y*cos(surf_angle))),surf_sinpowder)*surf_magnitude;

	st.x += adda*cos(surf_angle);
	st.y += adda*sin(surf_angle);

	COLOR = color;

 	float a1 = (yget(distance(vec2(0.),st),1.30,1.72,s11,3.1122,1.,1.121,0.437,4.,4.5,4.,5.,2.5,1.,0.)
	+ yget(distance(vec2(0.5,3.5),st),1.32,1.72,s11,3.1122,1.,1.121,0.437,4.269,4.5,4.,5.,2.5,-1.,0.)
	+ yget(distance(vec2(4.5,-4.5),st),1.31,1.72,s11,3.1122,1.,1.121,0.437,4.269,4.5,4.,5.,2.5,1.,0.)
	+ yget(distance(vec2(-5.5,-2.5),st),1.27,1.72,s11,3.1122,1.,1.121,0.437,5.,4.5,4.,5.,2.5,-1.,0.)
	+ yget(distance(vec2(-7.5,3.5),st),1.25,1.72,s11,3.1122,1.,1.121,0.437,5.,4.5,4.,5.,2.5,1.,0.)
	+ yget(distance(vec2(3.25,3.25),st),1.34,1.72,s11,3.1122,1.,1.121,0.437,4.269,4.5,4.,5.,2.5,1.,0.)
	+ yget(distance(vec2(6.25,-4.25),st),1.36,1.72,s11,3.1122,1.,1.121,0.437,4.269,4.5,4.,5.,2.5,-1.,0.)
	+ yget(distance(vec2(-7.25,-1.25),st),1.27,1.72,s11,3.1122,1.,1.121,0.437,5.,4.5,4.,5.,2.5,1.,0.)
	+ yget(distance(vec2(-0.25,5.25),st),1.59,1.72,s11,3.1122,1.,1.121,0.437,5.,4.5,4.,5.,2.5,-1.,0.))/9.;

 	float a2 = (yget(distance(vec2(0.),st2),1.30,1.72,s11,3.1122,1.,1.121,0.437,4.,4.5,4.,5.,2.5,1.,0.)
	+ yget(distance(vec2(0.5,3.5),st2),1.32,1.72,s11,3.1122,1.,1.121,0.437,4.269,4.5,4.,5.,2.5,-1.,0.)
	+ yget(distance(vec2(4.5,-4.5),st2),1.31,1.72,s11,3.1122,1.,1.121,0.437,4.269,4.5,4.,5.,2.5,1.,0.)
	+ yget(distance(vec2(-5.5,-2.5),st2),1.27,1.72,s11,3.1122,1.,1.121,0.437,5.,4.5,4.,5.,2.5,-1.,0.)
	+ yget(distance(vec2(-7.5,3.5),st2),1.25,1.72,s11,3.1122,1.,1.121,0.437,5.,4.5,4.,5.,2.5,1.,0.)
	+ yget(distance(vec2(3.25,3.25),st2),1.34,1.72,s11,3.1122,1.,1.121,0.437,4.269,4.5,4.,5.,2.5,1.,0.)
	+ yget(distance(vec2(6.25,-4.25),st2),1.36,1.72,s11,3.1122,1.,1.121,0.437,4.269,4.5,4.,5.,2.5,-1.,0.)
	+ yget(distance(vec2(-7.25,-1.25),st2),1.27,1.72,s11,3.1122,1.,1.121,0.437,5.,4.5,4.,5.,2.5,1.,0.)
	+ yget(distance(vec2(-0.25,5.25),st2),1.59,1.72,s11,3.1122,1.,1.121,0.437,5.,4.5,4.,5.,2.5,-1.,0.))/9.;

	float da = clamp((a2 - a1)*compress, 0., 1.);
	float ang = atan(da/dl);

	vec2 rUV = UV;
	rUV.y = (1. - rUV.y) + FRAGCOORD.y*SCREEN_PIXEL_SIZE.y;
	//vec4 RsC = textureLod(screen_texture, UVtoSreenUV(rUV, false, TEXTURE_PIXEL_SIZE, SCREEN_PIXEL_SIZE, FRAGCOORD), 0.0);//vec4(0.);
	vec4 bC = textureLod(screen_texture, UVtoSreenUV(shiftuv2(UV, ang*refraction_ratio), false, TEXTURE_PIXEL_SIZE, SCREEN_PIXEL_SIZE, FRAGCOORD), 0.0);

	float a = ((sin(ang - PI*0.5 + y_angle) + cos(ang - PI*1.5 + x_angle)) + adda)/1.5;//sin(ang - PI*0.5 + y_angle)*0.5 - cos(ang + x_angle)*0.5;

	COLOR.a = clamp(base_alpha + a, 0., 1.);
	COLOR.rgb = clamp(COLOR.rgb + mix(vec3(COLOR.a), bC.rgb, clear)*vec3(1. + add_light), vec3(0.), vec3(1.));
}