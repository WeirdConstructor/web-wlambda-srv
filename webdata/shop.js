"use strict";

function r(a, b) { return a + (b - a) * Math.random() }

var shuffle = function (array) {

	var currentIndex = array.length;
	var temporaryValue, randomIndex;

	// While there remain elements to shuffle...
	while (0 !== currentIndex) {
		// Pick a remaining element...
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1;

		// And swap it with the current element.
		temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	}

	return array;

};

class ShopData {
    constructor() {
        this.goods = [
            { name: "Game dev. soul", base: 10 },
            { name: "Card box",       base: 2 },
            { name: "Stray cat",      base: 5 },
            { name: "Privacy",        base: 7 },
            { name: "Batman",         base: 1 },
        ];

        this.seller_names = [
            "Gilly Mc TooMuch",
            "SellUShit Inc.",
            "MakeEmHappy",
            "Mr. X",
            "Wurstmann",
            "Bobbly",
        ];

        this.money = 1000;
        this.score = 0;
        this.storage = {};

        this.customers = [];
        this.sellers = [];
        this.seller_count = 5;
        this.tick_count = 0;

        this.seller_timeout = 10;
        this.next_customer_tout = 1;
    }

    get_money() { return this.money; }
    get_score() { return this.score; }
    get_tick_count() { return this.tick_count; }

    map_storage(f) {
        let self = this;
        SHOP.goods.map(function(g) {
            let count = self.storage[g.name];
            if (count != null)
                f({ name: g.name, count: count });
        });
    }

    get_good_clone(idx) {
        return { name: this.goods[idx].name, base: this.goods[idx].base };
    }

    do_tick() {
        let self = this;
        this.customers = this.customers.filter(
            function(c) {
                c.age += 1;
                c.ttl -= 1;
                if (c.ttl > 0) return true;
                else { if (!c.sold) self.score -= 1; return false; }
            });
        if (this.tick_count % this.seller_timeout == 0) {
            this.do_seller_tick();
        }
        if (this.tick_count % this.next_customer_tout == 0) {
            let new_cust_cnt = Math.round(r(1, Math.round(self.tick_count / 20)));
            for (let i = 0; i < new_cust_cnt; i++) {
                this.do_customer_tick();
            }
            this.next_customer_tout = Math.round(r(1, 15));
        }
        this.tick_count += 1;
        m.redraw();
    }

    get_shuffled_goods_idxes() {
        let goods_idxes = [];
        for (let i = 0; i < this.goods.length; i++) {
            goods_idxes.push(i);
        }
        shuffle(goods_idxes);
        return goods_idxes;
    }

    generate_seller(idx) {
        let goods_idxes = this.get_shuffled_goods_idxes();

        let goods = [];
        for (let i = 0; i < r(0, 2); i++) {
            let g = this.get_good_clone(goods_idxes[i]);
            goods.push(g);
            g.price_1  = Math.round(g.base * r(1.0 - 0.05, 1.0 - 0.02) * 10) / 10;
            g.price_10 = Math.round(g.price_1 * r(8, 9) * 10) / 10;
            g.price_25 = Math.round(g.price_1 * r(18, 24) * 10) / 10;
        }

        return { goods: goods };
    }

    sell(customer) {
        let a = this.storage[customer.good.name];
        if (a == null || a < customer.good.amount) return false;
        this.money += customer.good.price;
        this.money = Math.round(this.money * 10) / 10;
        this.storage[customer.good.name] -= customer.good.amount;
        this.score += 1;
        customer.sold = true;
        customer.ttl = 0;
        return true;
    }

    buy(good, amount, price) {
        if (this.money < price) {
            return false;
        }
        this.money -= price;
        this.money = Math.round(this.money * 10) / 10;
        if (this.storage[good.name] == null) {
            this.storage[good.name] = 0;
        }
        this.storage[good.name] += amount
        good.bought = true;
    }

    do_customer_tick() {
        if (this.customers.length > 10)
            return;

        let goods_idxes = this.get_shuffled_goods_idxes();
        let g = this.get_good_clone(goods_idxes[0]);
        g.amount = Math.round(r(1, 50)); // * (1 + this.tick_count / 20));
        let score_bonus = 1 + (this.score / 10);
        if (score_bonus < 1) score_bonus = 1;
        g.price = g.amount * g.base * (r(1 - 0.1, 1 - 0.01) * score_bonus);
        g.price = Math.round(g.price * 10) / 10;
        this.customers.push({
            good: g,
            ttl: r(5, 30),
            age: 0,
        });
    }

    map_customers(f) { this.customers.map(f); }

    do_seller_tick() {
        let s = [];
        for (let i = 0; i < this.seller_count; i++) {
            let seller = this.generate_seller();
            seller.index = i;
            seller.name = this.seller_names[i];
            s.push(seller);
        }
        this.sellers = s;
    }

    map_sellers(f) {
        this.sellers.map(f);
    }

    tick() {
        let self = this;
        this.do_tick();
        setTimeout(function() { self.tick() }, 1000);
    }
};


var SHOP = new ShopData();


// Concept: Each 10 seconds 1 customer comes with a special requirement
//          Customers ask for 1% to 10% below base price
//          If you fail to give him what he wants for the price given
//          within 20 seconds, you get 1 minus point
//          if you do, you get 1 point plus
//          with each point you earn, your customers will pay 1% over base price more.
//
// To meet requirements, you got to buy from your wholesalers
// You have N salers, each has a random selection of goods.
// Pricemargins are randomized. Starting with 2-5% below base price.
// If you buy 1 you get the default margin, if you buy 10 you get 1-2 for free.
// If you buy 25 you get 3-5 for free. If you buy 100, you get 10-15 for free.
//
// Each 10 seconds, the saler makes a new offer.
//
// Layout
//      - on top you get your money and the score points
//      - list of customer requirements, you get a button if your storage has the item
//        a countdown is next to it.
//      - you have a table with your storage (name, amount)
//      - you have N tabs with salers you can click through to see the 
//        offers
//
var TopLevel = {
    view: function(vn) {
        let customers = [];
        SHOP.map_customers(function(c) {
            if (c.sold) return;
            customers.push(m("li", [
                m("span", "Wants "),
                m("b", c.good.amount),
                m("span", " of " + c.good.name + " for "),
                m("b", Math.round((c.good.price / c.good.amount) * 10) / 10),
                m("span", " wait time " + c.age),
                m("button", { class: "button",
                              onclick: function() { SHOP.sell(c) } },
                  "Sell"),
            ]));
        });

        let storage = [];
        SHOP.map_storage(function(item) {
            storage.push(m("tr", [ m("th", item.name), m("td", item.count) ]));
        });

        let sellers = [];
        SHOP.map_sellers(function(s) {
            let tbl = s.goods.filter(function(g) { return !g.bought }).map(function(g) {
                return m("tr", [
                    m("th", g.name),
                    m("td", g.price_1),
                    m("td",
                        m("button", { class: "button", onclick: function() {
                            SHOP.buy(g, 1, g.price_1);
                        } }, "Buy")),
                    m("td", Math.round((g.price_10 / 10) * 10) / 10),
                    m("td",
                        m("button", { class: "button", onclick: function() {
                            SHOP.buy(g, 10, g.price_10);
                        } }, "Buy")),
                    m("td", Math.round((g.price_25 / 25) * 10) / 10),
                    m("td",
                        m("button", { class: "button", onclick: function() {
                            SHOP.buy(g, 25, g.price_25);
                        } }, "Buy")),
                ]);
            });
            tbl.unshift(m("tr"), [
                m("th", { width: "10%" }, "Good"),
                m("th", { width: "1%" }, "Price for 1"),
                m("th", { width: "1%" }, ""),
                m("th", { width: "1%" }, "Price for 10"),
                m("th", { width: "1%" }, ""),
                m("th", { width: "1%" }, "Price for 25"),
                m("th", { width: "1%" }, ""),
            ]);
            sellers.push(m("li", [
                m("span", s.name),
                m("table", { style: "width: 50%", class: "is-size-7" }, tbl),
            ]));
        });

        return m("div", { id: "top" }, [
            m("section", { class: "section" }, [
                m("div", { class: "content" }, [
                    m("div", { class: "columns" }, [
                        m("div", { class: "column" }, [ m("h3", "Time: "  + SHOP.get_tick_count()), ]),
                        m("div", { class: "column" }, [ m("h3", "Money: " + SHOP.get_money()), ]),
                        m("div", { class: "column" }, [ m("h3", "Score: " + SHOP.get_score()), ]),
                    ]),
                    m("h4", "Customers"),
                    m("ul", customers),
                    m("h4", "Storage"),
                    m("table", storage),
                    m("h4", "Sellers"),
                    m("ul", sellers),
                ]),
            ])
        ]);
    },
};

SHOP.tick();

m.mount(document.body, TopLevel);
