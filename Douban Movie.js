{
	"translatorID": "d0a65ab7-b10c-4801-a906-05505fecc749",
	"label": "Douban Movie",
	"creator": "Felix Hui",
	"target": "https?://(movie|www).douban.com(/doulist)?",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2020-07-11 04:32:16"
}

/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2020 Felix Hui

	This file is part of Zotero.

	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero. If not, see <http://www.gnu.org/licenses/>.

	***** END LICENSE BLOCK *****
*/

// eslint-disable-next-line
function attr(docOrElem,selector,attr,index){var elem=index?docOrElem.querySelectorAll(selector).item(index):docOrElem.querySelector(selector);return elem?elem.getAttribute(attr):null;}function text(docOrElem,selector,index){var elem=index?docOrElem.querySelectorAll(selector).item(index):docOrElem.querySelector(selector);return elem?elem.textContent:null;}

function doPerson(item, data, creatorType) {
	if (!data || data.length <= 0) return;
	const persons = data.split('/');
	for (var person of persons) {
		item.creators.push({
			lastName: person.trim().replace('更多...', ''),
			creatorType: creatorType,
			fieldMode: 1
		});
	}
}

function doTag(item, data) {
	if (!data || data.length <= 0) return;
	const tags = data.split('/');
	for (var tag of tags) {
		item.tags.push(tag.trim());
	}
}

function detectWeb(doc, url) {
	if (url.includes('/subject/')) {
		return "film";
	}
	else if (getSearchResults(doc, url, true)) {
		return "multiple";
	}
	return false;
}

function getSearchResults(doc, url, checkOnly) {
	// 列表使用 AJAX 加载，调用该方法时还未完成加载
	// 检查时，不做列表的验证(只使用URL验证)
	if (checkOnly) return true;

	var items = {};
	var found = false;

	var rows;
	if (url.includes('.com/chart')) {
		rows = doc.querySelectorAll('div.indent a');
	}
	else if (url.includes('.com/top')) {
		rows = doc.querySelectorAll('ol.grid_view div.info a');
	}
	// 与 Douban.js 有冲突
	// 可以先把 Douban.js 从 zotero/translators 移出，抓取后再移回
	else if (url.includes('.com/doulist/')) {
		rows = doc.querySelectorAll('div.article div.doulist-item div.title a');
	}
	else {
		rows = doc.querySelectorAll('div.list-wp a');
	}
	if (!rows || rows.length <= 0) return found;

	for (let row of rows) {
		let href = row.href;
		let title = ZU.trimInternal(row.textContent);
		if (!href || !title) continue;
		if (checkOnly) return true;
		found = true;
		items[href] = title;
	}
	return found ? items : false;
}

function doWeb(doc, url) {
	if (detectWeb(doc, url) == "multiple") {
		Zotero.selectItems(getSearchResults(doc, url, false), function (items) {
			if (items) ZU.processDocuments(Object.keys(items), scrape);
		});
	}
	else {
		scrape(doc, url);
	}
}

function scrape(doc, url) {
	var item = new Zotero.Item("film");

	item.url = url;

	item.title = text(doc, 'h1 span[property="v:itemreviewed"]');

	var pattern, episodeCount;
	const infos = text(doc, 'div[class*="subject"] div#info');
	for (var section of Object.values(infos.split('\n'))) {
		if (!section || section.trim() === "") continue;

		let strArr = section.split(':');
		if (!strArr[0] || !strArr[1]) continue;

		let value = strArr[1].trim();
		switch (strArr[0].trim()) {
			case "导演":
				doPerson(item, value, "director");
				break;
			case "编剧":
				doPerson(item, value, "scriptwriter");
				break;
			case "主演":
				doPerson(item, value, "contributor");
				break;
			case "类型":
				item.genre = value;
				doTag(item, value);
				break;
			case "制片国家/地区":
				item.distributor = value;
				break;
			case "语言":
				item.language = value;
				break;
			case "上映日期":
			case "首播":
				// eslint-disable-next-line
				pattern = /\d+[-|\/]\d+[-|\/]\d+/;
				if (value && pattern.test(value)) {
					item.date = pattern.exec(value)[0];
				}
				else {
					item.date = value;
				}
				break;
			case "季数":
				break;
			case "集数":
				// 考虑是否将 film 改为 tvBroadcast
				episodeCount = value;
				break;
			case "单集片长":
				// {集数}必须先于{单集片长}
				pattern = /\d+/;
				if (value && pattern.test(value)) {
					var runningTime = pattern.exec(value)[0];
					item.runningTime = (runningTime * episodeCount) + value.replace(runningTime, "");
				}
				break;
			case "片长":
				item.runningTime = value;
				break;
			case "又名":
				item.shortTitle = value;
				break;
			case "IMDb链接":
				item.attachments.push({
					url: "https://www.imdb.com/title/" + value,
					snapshot: false,
					title: "IMDb"
				});
				break;
			default:
				break;
		}
	}

	// 摘要
	let abstractNote = text(doc, 'div.related-info span[class*="all"]');
	if (!abstractNote) {
		abstractNote = text(doc, 'div.related-info span');
	}
	// eslint-disable-next-line
	item.abstractNote = abstractNote.trim().replace(/([　 ]*\n[　 ]*)+/g, '\n');

	// 评分 & 评价人数
	var ratingNum = text(doc, 'strong[property*="v:average"]');
	if (ratingNum) {
		var ratingPeople = text(doc, 'div.rating_sum a.rating_people span[property="v:votes"]');
		item.extra = ratingNum.trim() + "/" + ratingPeople;
	}

	item.complete();
}

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "https://movie.douban.com/subject/1292052/",
		"items": [
			{
				"itemType": "film",
				"title": "肖申克的救赎 The Shawshank Redemption",
				"creators": [
					{
						"lastName": "弗兰克·德拉邦特",
						"creatorType": "director",
						"fieldMode": 1
					},
					{
						"lastName": "弗兰克·德拉邦特",
						"creatorType": "scriptwriter",
						"fieldMode": 1
					},
					{
						"lastName": "斯蒂芬·金",
						"creatorType": "scriptwriter",
						"fieldMode": 1
					},
					{
						"lastName": "蒂姆·罗宾斯",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "摩根·弗里曼",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "鲍勃·冈顿",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "威廉姆·赛德勒",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "克兰西·布朗",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "吉尔·贝罗斯",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "马克·罗斯顿",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "詹姆斯·惠特摩",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "杰弗里·德曼",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "拉里·布兰登伯格",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "尼尔·吉恩托利",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "布赖恩·利比",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "大卫·普罗瓦尔",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "约瑟夫·劳格诺",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "祖德·塞克利拉",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "保罗·麦克兰尼",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "芮妮·布莱恩",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "阿方索·弗里曼",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "V·J·福斯特",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "弗兰克·梅德拉诺",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "马克·迈尔斯",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "尼尔·萨默斯",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "耐德·巴拉米",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "布赖恩·戴拉特",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "唐·麦克马纳斯",
						"creatorType": "contributor",
						"fieldMode": 1
					}
				],
				"date": "1994-09-10(多伦多电影节) / 1994-10-14(美国)",
				"abstractNote": "20世纪40年代末，小有成就的青年银行家安迪（蒂姆·罗宾斯 Tim Robbins 饰）因涉嫌杀害妻子及她的情人而锒铛入狱。在这座名为鲨堡的监狱内，希望似乎虚无缥缈，终身监禁的惩罚无疑注定了安迪接下来灰暗绝望的人生。未过多久，安迪尝试接近囚犯中颇有声望的瑞德（摩根·弗 里曼 Morgan Freeman 饰），请求对方帮自己搞来小锤子。以此为契机，二人逐渐熟稔，安迪也仿佛在鱼龙混杂、罪恶横生、黑白混淆的牢狱中找到属于自己的求生之道。他利用自身的专业知识，帮助监狱管理层逃税、洗黑钱，同时凭借与瑞德的交往在犯人中间也渐渐受到礼遇。表面看来，他已如瑞德那样对那堵高墙从憎恨转变为处之泰然，但是对自由的渴望仍促使他朝着心中的希望和目标前进。而关于其罪行的真相，似乎更使这一切朝前推进了一步……\n                                　　本片根据著名作家斯蒂芬·金（Stephen Edwin King）的原著改编。",
				"distributor": "美国",
				"extra": "9.7/2069725",
				"genre": "剧情 / 犯罪",
				"language": "英语",
				"libraryCatalog": "Douban Movie",
				"runningTime": "142分钟",
				"shortTitle": "月黑高飞(港) / 刺激1995(台) / 地狱诺言 / 铁窗岁月 / 消香克的救赎",
				"url": "https://movie.douban.com/subject/1292052/",
				"attachments": [],
				"tags": [
					{
						"tag": "剧情"
					},
					{
						"tag": "犯罪"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://movie.douban.com/tag/#/?sort=U&range=0,10&tags=%E7%94%B5%E5%BD%B1",
		"items": "multiple"
	},
	{
		"type": "web",
		"url": "https://movie.douban.com/chart",
		"items": "multiple"
	},
	{
		"type": "web",
		"url": "https://movie.douban.com/subject/26939247/",
		"items": [
			{
				"itemType": "film",
				"title": "夏目友人帐 第六季 夏目友人帳 陸",
				"creators": [
					{
						"lastName": "大森贵弘",
						"creatorType": "director",
						"fieldMode": 1
					},
					{
						"lastName": "出合小都美",
						"creatorType": "director",
						"fieldMode": 1
					},
					{
						"lastName": "绿川幸",
						"creatorType": "scriptwriter",
						"fieldMode": 1
					},
					{
						"lastName": "村井贞之",
						"creatorType": "scriptwriter",
						"fieldMode": 1
					},
					{
						"lastName": "神谷浩史",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "井上和彦",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "小林沙苗",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "石田彰",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "堀江一真",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "木村良平",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "菅沼久义",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "泽城美雪",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "佐藤利奈",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "伊藤美纪 Miki Itô",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "伊藤荣次",
						"creatorType": "contributor",
						"fieldMode": 1
					},
					{
						"lastName": "诹访部顺一",
						"creatorType": "contributor",
						"fieldMode": 1
					}
				],
				"date": "2017-04-11",
				"abstractNote": "与温柔友人们度过的，值得珍惜的每一天——\n                                　　美丽而虚幻的，人与妖的物语。\n                                    \n                                　　从小就能看见妖怪的少年·夏目贵志，继承了祖母玲子的遗产“友人帐”，与自称保镖的猫咪老师一起，开始将名字返还给被束缚在友人帐中的妖怪。\n                                    \n                                　　通过与妖怪及与之相关的人们接触，开始摸索自己前进之路的夏目，在与心灵相通的朋友们帮助下，设法守护自己重要的每一天。",
				"distributor": "日本",
				"extra": "9.6/31280",
				"genre": "剧情 / 动画 / 奇幻",
				"language": "日语",
				"libraryCatalog": "Douban Movie",
				"runningTime": "264分钟",
				"shortTitle": "妖怪联络簿 六(台) / Natsume's Book of Friends 6 / Natsume Yuujinchou Roku",
				"url": "https://movie.douban.com/subject/26939247/",
				"attachments": [
					{
						"snapshot": false,
						"title": "IMDb"
					}
				],
				"tags": [
					{
						"tag": "剧情"
					},
					{
						"tag": "动画"
					},
					{
						"tag": "奇幻"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/